import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const HYPERTIDE_BASE = 'https://smartlead.hypertide.io/smartlead/api'
const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'
const TAG_PAGE_LIMIT = 100
const MAX_TAG_PAGES = 200
const TAG_COLORS = [
  '#B1FCFA',
  '#FCE1B1',
  '#FCEFB1',
  '#D7FCB1',
  '#B1DDFC',
  '#D6B1FC',
  '#FCB1D7',
  '#FCC4B1',
]

const TAGS_QUERY = `query getPaginatedTags($offset: Int!, $limit: Int!, $where: tags_bool_exp!) {
  tags(where: $where, offset: $offset, limit: $limit, order_by: {id: desc}) {
    created_at
    id
    name
    color
  }
}`

const CREATE_TAG_MUTATION = `mutation createTag($object: tags_insert_input!) {
  insert_tags_one(object: $object) {
    created_at
    id
    name
    color
  }
}`

type BulkAction = 'tags' | 'outbound' | 'warmup'

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

interface UpstreamTag {
  created_at?: unknown
  id?: unknown
  name?: unknown
  color?: unknown
}

function normalizeTag(value: UpstreamTag) {
  return {
    id: Number(value.id) || 0,
    name: String(value.name ?? '').trim(),
    color: String(value.color ?? '').trim() || '#B1FCFA',
    createdAt: String(value.created_at ?? '').trim() || null,
  }
}

async function tagGraphqlRequest(
  jwt: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const upstream = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await upstream.text()
  let payload: Record<string, unknown>
  try {
    payload = objectValue(JSON.parse(text))
  } catch {
    throw new Error(
      `Smartlead returned an invalid tag response (${upstream.status}).`,
    )
  }
  if (!upstream.ok) {
    throw new Error(
      String(payload.error ?? '') ||
        `Smartlead tag request failed (${upstream.status}).`,
    )
  }
  const errors = Array.isArray(payload.errors) ? payload.errors : []
  if (errors.length > 0) {
    const message = errors
      .map((error) => String(objectValue(error).message ?? ''))
      .filter(Boolean)
      .join('; ')
    throw new Error(message || 'Smartlead GraphQL returned a tag error.')
  }
  return objectValue(payload.data)
}

async function listTags(res: VercelResponse, jwt: string) {
  const tags: ReturnType<typeof normalizeTag>[] = []
  const seenIds = new Set<number>()

  for (let page = 0; page < MAX_TAG_PAGES; page++) {
    const data = await tagGraphqlRequest(jwt, {
      operationName: 'getPaginatedTags',
      variables: {
        offset: page * TAG_PAGE_LIMIT,
        limit: TAG_PAGE_LIMIT,
        where: {},
      },
      query: TAGS_QUERY,
    })
    const rows = Array.isArray(data.tags) ? data.tags : []
    for (const row of rows) {
      const tag = normalizeTag(objectValue(row) as UpstreamTag)
      if (!tag.id || !tag.name || seenIds.has(tag.id)) continue
      seenIds.add(tag.id)
      tags.push(tag)
    }
    if (rows.length < TAG_PAGE_LIMIT) {
      res.setHeader('cache-control', 'private, max-age=0, no-store')
      return res.status(200).json({ tags })
    }
  }

  return res.status(502).json({
    error: `Tag loading stopped after ${MAX_TAG_PAGES * TAG_PAGE_LIMIT} rows.`,
  })
}

async function createTag(
  req: VercelRequest,
  res: VercelResponse,
  jwt: string,
) {
  const name = String(objectValue(req.body).name ?? '').trim()
  if (!name || name.length > 100) {
    return res.status(400).json({
      error: 'Tag name must be between 1 and 100 characters.',
    })
  }
  const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
  const data = await tagGraphqlRequest(jwt, {
    operationName: 'createTag',
    variables: { object: { name, color } },
    query: CREATE_TAG_MUTATION,
  })
  const tag = normalizeTag(objectValue(data.insert_tags_one) as UpstreamTag)
  if (!tag.id || !tag.name) {
    return res.status(502).json({
      error: 'Smartlead created the tag but returned an incomplete response.',
    })
  }
  res.setHeader('cache-control', 'private, max-age=0, no-store')
  return res.status(201).json({ tag })
}

async function runBulkEmailAccountAction(
  res: VercelResponse,
  jwt: string,
  endpoint: string,
) {
  const upstream = await fetch(`${SMARTLEAD_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  const text = await upstream.text()
  res.setHeader('cache-control', 'private, max-age=0, no-store')
  res.status(upstream.status)
  res.setHeader(
    'content-type',
    upstream.headers.get('content-type') || 'application/json; charset=utf-8',
  )
  return res.send(text)
}

function domainFromEmail(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1) : ''
}

function isValidDomain(domain: string): boolean {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
    domain,
  )
}

function integerInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    return null
  }
  return numberValue
}

async function updateDomainSettings(
  req: VercelRequest,
  res: VercelResponse,
  jwt: string,
) {
  const body = objectValue(req.body)
  const action = String(body.action ?? '') as BulkAction
  if (!['tags', 'outbound', 'warmup'].includes(action)) {
    return res.status(400).json({ error: 'Unknown bulk settings action.' })
  }

  const domains = Array.isArray(body.domains)
    ? Array.from(
        new Set(
          body.domains
            .map((value) => String(value).trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : []
  if (domains.length === 0) {
    return res.status(400).json({ error: 'Select at least one domain.' })
  }
  const invalidDomains = domains.filter((domain) => !isValidDomain(domain))
  if (invalidDomains.length > 0) {
    return res.status(400).json({
      error: `Invalid domain format: ${invalidDomains.slice(0, 3).join(', ')}`,
    })
  }

  const domainSet = new Set(domains)
  const accountIds = new Set<number>()
  const accounts = (Array.isArray(body.accounts) ? body.accounts : [])
    .map(objectValue)
    .filter((account) => {
      const id = Number(account.id)
      const domain = domainFromEmail(account.from_email)
      if (!Number.isInteger(id) || id <= 0 || !domainSet.has(domain)) return false
      if (accountIds.has(id)) return false
      accountIds.add(id)
      return true
    })
  if (accounts.length === 0) {
    return res.status(400).json({
      error: 'No inboxes matched the selected domains.',
    })
  }

  let updateData: Record<string, unknown>
  if (action === 'tags') {
    const tags = Array.isArray(body.tags)
      ? Array.from(
          new Set(
            body.tags
              .map((value) => String(value).trim())
              .filter(Boolean),
          ),
        )
      : []
    if (tags.length === 0 || tags.length > 50) {
      return res.status(400).json({
        error: 'Provide between 1 and 50 existing Smartlead tag names.',
      })
    }
    updateData = { tags }
  } else if (action === 'outbound') {
    const settings = objectValue(body.settings)
    const messagePerDay = integerInRange(settings.messagePerDay, 0, 1000)
    const minTimeToWaitInMins = integerInRange(
      settings.minTimeToWaitInMins,
      0,
      1440,
    )
    if (messagePerDay === null || minTimeToWaitInMins === null) {
      return res.status(400).json({
        error:
          'Outbound settings require whole-number daily and wait-time limits.',
      })
    }
    updateData = {
      settings: {
        messagePerDay,
        minTimeToWaitInMins,
        status: 'ACTIVE',
      },
    }
  } else {
    const settings = objectValue(body.settings)
    const maxEmailPerDay = integerInRange(settings.maxEmailPerDay, 0, 1000)
    const rampupValue = integerInRange(settings.rampupValue, 0, 1000)
    const replyRate = integerInRange(settings.replyRate, 0, 100)
    const warmupTagIdentifier = String(
      settings.warmupTagIdentifier ?? '',
    ).trim()
    if (
      maxEmailPerDay === null ||
      rampupValue === null ||
      replyRate === null ||
      warmupTagIdentifier.length > 100
    ) {
      return res.status(400).json({
        error: 'Warmup settings contain an invalid value.',
      })
    }
    updateData = {
      settings: {
        isRampupEnabled: settings.isRampupEnabled === true,
        maxEmailPerDay,
        rampupValue,
        replyRate,
        status: 'ACTIVE',
        warmupTagIdentifier,
      },
    }
  }

  const endpoint =
    action === 'tags'
      ? 'update_tags'
      : action === 'outbound'
        ? 'update_outbound'
        : 'update_warmup'

  try {
    const upstream = await fetch(`${HYPERTIDE_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: jwt,
        accounts,
        domains,
        ...updateData,
      }),
    })
    const text = await upstream.text()
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    res.status(upstream.status)
    res.setHeader(
      'content-type',
      upstream.headers.get('content-type') ||
        'application/json; charset=utf-8',
    )
    return res.send(text)
  } catch (error) {
    return res.status(502).json({
      error: `Bulk ${action} update failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}

// GET /api/email-accounts?offset=0
// Proxies one page of in-use email accounts (limit fixed at 100).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables, or pass a JWT from the UI.',
    })
  }

  const mode = Array.isArray(req.query.mode)
    ? req.query.mode[0]
    : req.query.mode

  try {
    if (req.method === 'GET' && mode === 'tags') {
      return await listTags(res, jwt)
    }
    if (
      req.method === 'POST' &&
      String(objectValue(req.body).mode ?? '') === 'create-tag'
    ) {
      return await createTag(req, res, jwt)
    }
    if (
      req.method === 'POST' &&
      String(objectValue(req.body).mode ?? '') === 'validate-dns'
    ) {
      return await runBulkEmailAccountAction(
        res,
        jwt,
        '/api/email-account/bulk-verify-domain-email-configurations',
      )
    }
    if (
      req.method === 'POST' &&
      String(objectValue(req.body).mode ?? '') === 'bulk-reconnect'
    ) {
      return await runBulkEmailAccountAction(
        res,
        jwt,
        '/api/email-account/bulk-save-failed-email-accounts',
      )
    }
  } catch (error) {
    return res.status(502).json({
      error: `Email-account request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  if (req.method === 'POST') {
    return updateDomainSettings(req, res, jwt)
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' })
  }

  const offset = Number(req.query.offset ?? 0) || 0
  // Pass isInUse through so the service layer can call us twice (true + false).
  const isInUse = req.query.isInUse
  const inUseParam = isInUse !== undefined ? `&isInUse=${isInUse}` : ''
  const url = `${SMARTLEAD_BASE}/api/email-account/get-total-email-accounts?offset=${offset}&limit=100${inUseParam}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}` },
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.send(text)
  } catch (e) {
    res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
