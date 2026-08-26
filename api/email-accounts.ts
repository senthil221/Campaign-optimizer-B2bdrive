import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  deleteSnapshotAccounts,
  markSnapshotStale,
  rawAccountsForDomains,
  snapshotEnabled,
} from './_lib/smartlead-snapshot.js'
import { groupDomainsByCurrentLimit } from './_lib/outbound-groups.js'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'
// Bulk settings writes used to go through a third-party helper
// (smartlead.hypertide.io), which took the whole domain selection and fanned it
// out. That host went offline and returned its hosting provider's HTML 404,
// which this route relayed verbatim into the dashboard. Writes now go straight
// to Smartlead's own bulk endpoint with the operator's JWT — the same host and
// auth as the bulk-delete call below.
const BULK_CONFIG_URL = `${SMARTLEAD_BASE}/api/email-account/bulk-update-email-account-config`
// Ids per upstream call, and how many of those calls run at once.
const BULK_CONFIG_CHUNK = 250
const BULK_CONFIG_CONCURRENCY = 4
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

// Deleting a tag also drops its mailbox mappings; Smartlead cascades those
// server-side, so the returned row is only used to confirm the id existed.
const DELETE_TAG_MUTATION = `mutation deleteTag($id: Int!) {
  delete_tags_by_pk(id: $id) {
    id
    name
  }
}`

type BulkAction = 'tags' | 'outbound' | 'warmup' | 'warmup_toggle'

// Older bundles split outbound updates into two half-payload actions. Smartlead
// replaces the whole outbound settings block, so a half payload silently reset
// the other field to a default. Those names are still accepted, but they now go
// through the same both-fields-required validation and fail loudly instead.
const OUTBOUND_ACTIONS = new Set(['outbound', 'outbound_limit', 'outbound_wait'])

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

/** Every tag in the workspace, paged. Throws past the page ceiling. */
async function fetchAllTags(jwt: string) {
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
    if (rows.length < TAG_PAGE_LIMIT) return tags
  }

  throw new Error(
    `Tag loading stopped after ${MAX_TAG_PAGES * TAG_PAGE_LIMIT} rows.`,
  )
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

async function deleteTag(
  req: VercelRequest,
  res: VercelResponse,
  jwt: string,
) {
  const id = Number(objectValue(req.body).id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Provide a numeric tag id to delete.' })
  }
  const data = await tagGraphqlRequest(jwt, {
    operationName: 'deleteTag',
    variables: { id },
    query: DELETE_TAG_MUTATION,
  })
  const deleted = objectValue(data.delete_tags_by_pk)
  if (!Number(deleted.id)) {
    return res.status(404).json({
      error: 'That tag no longer exists in Smartlead.',
    })
  }
  // Mailboxes carry tag mappings, so cached inbox rows are now out of date.
  await markSnapshotStale()
  res.setHeader('cache-control', 'private, max-age=0, no-store')
  return res.status(200).json({
    success: true,
    id,
    name: String(deleted.name ?? ''),
  })
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
  if (upstream.ok) await markSnapshotStale()
  res.setHeader('cache-control', 'private, max-age=0, no-store')
  res.status(upstream.status)
  res.setHeader(
    'content-type',
    upstream.headers.get('content-type') || 'application/json; charset=utf-8',
  )
  return res.send(text)
}

const MAX_BULK_DELETE_IDS = 2000

async function bulkDeleteEmailAccounts(
  req: VercelRequest,
  res: VercelResponse,
  jwt: string,
) {
  const body = objectValue(req.body)
  const emailAccountIds = Array.isArray(body.emailAccountIds)
    ? Array.from(
        new Set(
          body.emailAccountIds
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      )
    : []
  if (emailAccountIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'Provide at least one inbox to delete.' })
  }
  if (emailAccountIds.length > MAX_BULK_DELETE_IDS) {
    return res.status(400).json({
      error: `A maximum of ${MAX_BULK_DELETE_IDS} inboxes can be deleted per request.`,
    })
  }

  try {
    const upstream = await fetch(
      `${SMARTLEAD_BASE}/api/email-account/bulk-delete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ emailAccountIds }),
      },
    )
    const text = await upstream.text()
    if (upstream.ok) await deleteSnapshotAccounts(emailAccountIds)
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
      error: `Bulk delete failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
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

const MAX_OUTBOUND_GROUPS = 50
const OUTBOUND_GROUP_CONCURRENCY = 3

/**
 * Turns an upstream failure into one readable sentence. An HTML body means we
 * reached something that is not the API (a proxy, an error page, a parked
 * host), so it is described rather than pasted — that is what put a hosting
 * provider's 404 page inside the dashboard's error banner.
 */
function describeUpstreamFailure(
  status: number,
  contentType: string,
  text: string,
): string {
  const body = text.trim()
  const looksHtml =
    contentType.toLowerCase().includes('text/html') ||
    body.slice(0, 200).toLowerCase().includes('<!doctype html') ||
    body.slice(0, 200).toLowerCase().includes('<html')
  if (looksHtml) {
    return `Smartlead's bulk settings endpoint returned an HTML error page (${status}) instead of a response. The upstream service is unavailable — retry shortly.`
  }
  if (!body) return `Smartlead rejected the update (${status}).`
  let message = body
  try {
    const payload = objectValue(JSON.parse(body))
    message =
      String(payload.error ?? payload.message ?? '').trim() || body
  } catch {
    // Plain-text upstream error; use it as-is.
  }
  return `Smartlead rejected the update (${status}): ${message.slice(0, 300)}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

function accountIdsOf(accounts: Record<string, unknown>[]): number[] {
  const ids = new Set<number>()
  for (const account of accounts) {
    const id = Number(account.id)
    if (Number.isInteger(id) && id > 0) ids.add(id)
  }
  return [...ids]
}

/**
 * One bulk write against Smartlead. `updateData` is the flat settings object
 * for the action (e.g. `{ messagePerDay, minTimeToWaitInMins, status }`);
 * Smartlead applies it to every id in `emailAccountIds`.
 */
async function postBulkAccountConfig(
  jwt: string,
  emailAccountIds: number[],
  updateData: Record<string, unknown>,
): Promise<void> {
  const upstream = await fetch(BULK_CONFIG_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      emailAccountIds,
      // Smartlead's own UI sends dailyReplyLimit on every bulk config write,
      // whichever setting is being changed; mirror that.
      updateData: { dailyReplyLimit: null, ...updateData },
      excludeEmailAccountIds: [],
    }),
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    throw new Error(
      describeUpstreamFailure(
        upstream.status,
        upstream.headers.get('content-type') ?? '',
        text,
      ),
    )
  }
  // A 200 carrying `success: false` is still a failure.
  let payload: Record<string, unknown> | null = null
  try {
    payload = objectValue(JSON.parse(text))
  } catch {
    // Non-JSON 2xx body. Smartlead has returned plain text here before, so a
    // successful status with an unparseable body still counts as applied.
  }
  if (payload && (payload.success === false || payload.ok === false)) {
    throw new Error(
      String(payload.error ?? payload.message ?? '').trim() ||
        'Smartlead reported the bulk update as unsuccessful.',
    )
  }
}

interface BulkConfigOutcome {
  updated: number
  failed: number
  error?: string
}

/** Applies one settings object across many inboxes, chunked and in parallel. */
async function applyBulkConfig(
  jwt: string,
  emailAccountIds: number[],
  updateData: Record<string, unknown>,
): Promise<BulkConfigOutcome> {
  const chunks = chunk(emailAccountIds, BULK_CONFIG_CHUNK)
  const results = await bulkMapWithConcurrency(
    chunks,
    BULK_CONFIG_CONCURRENCY,
    async (ids) => {
      try {
        await postBulkAccountConfig(jwt, ids, updateData)
        return { count: ids.length, ok: true as const }
      } catch (error) {
        return {
          count: ids.length,
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
  const failedChunks = results.filter((result) => !result.ok)
  return {
    updated: results
      .filter((result) => result.ok)
      .reduce((sum, result) => sum + result.count, 0),
    failed: failedChunks.reduce((sum, result) => sum + result.count, 0),
    error: failedChunks[0]?.error,
  }
}

function domainList(values: string[]): string {
  return values.length <= 3
    ? values.join(', ')
    : `${values.slice(0, 3).join(', ')} and ${values.length - 3} more`
}

async function applyPreservedOutbound(
  res: VercelResponse,
  jwt: string,
  accounts: Record<string, unknown>[],
  domains: string[],
  minTimeToWaitInMins: number,
) {
  const { groups, mixed, unknown } = groupDomainsByCurrentLimit(
    accounts,
    domains,
  )

  if (unknown.length > 0) {
    return res.status(400).json({
      error:
        `Smartlead has not reported a current max emails per day for every inbox on ${domainList(unknown)}. ` +
        'Refresh accounts, or clear "Keep each inbox\'s current max" and set the value explicitly.',
    })
  }
  if (mixed.length > 0) {
    return res.status(400).json({
      error:
        `These domains have inboxes with different max emails per day, so the current values cannot be preserved in one pass: ${domainList(mixed)}. ` +
        'Apply to them separately with an explicit max, or deselect them.',
    })
  }
  if (groups.length === 0) {
    return res.status(400).json({
      error: 'No inboxes matched the selected domains.',
    })
  }
  if (groups.length > MAX_OUTBOUND_GROUPS) {
    return res.status(400).json({
      error:
        `The selection spans ${groups.length} different max-emails values and only ${MAX_OUTBOUND_GROUPS} can be preserved per request. ` +
        'Narrow the selection and apply again.',
    })
  }

  const results = await bulkMapWithConcurrency(
    groups,
    OUTBOUND_GROUP_CONCURRENCY,
    async (group) => {
      try {
        const outcome = await applyBulkConfig(
          jwt,
          accountIdsOf(group.accounts),
          {
            messagePerDay: group.messagePerDay,
            minTimeToWaitInMins,
          },
        )
        if (outcome.failed > 0) {
          throw new Error(
            outcome.error ?? 'Smartlead rejected part of the update.',
          )
        }
        return {
          messagePerDay: group.messagePerDay,
          domainCount: group.domains.length,
          accountCount: group.accounts.length,
          ok: true as const,
        }
      } catch (error) {
        return {
          messagePerDay: group.messagePerDay,
          domainCount: group.domains.length,
          accountCount: group.accounts.length,
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )

  const failed = results.filter((result) => !result.ok)
  const applied = results.filter((result) => result.ok)
  if (applied.length > 0) await markSnapshotStale()

  res.setHeader('cache-control', 'private, max-age=0, no-store')
  if (failed.length > 0) {
    // Partial success is reported as a failure so the operator investigates.
    return res.status(502).json({
      success: false,
      error:
        `${applied.length} of ${results.length} max-emails groups updated. ` +
        `Failed at max ${failed.map((result) => result.messagePerDay).join(', ')}: ${failed[0].error}`,
      groups: applied,
    })
  }
  return res.status(200).json({ success: true, preserved: true, groups: applied })
}

async function updateDomainSettings(
  req: VercelRequest,
  res: VercelResponse,
  jwt: string,
) {
  const body = objectValue(req.body)
  const rawAction = String(body.action ?? '')
  const action: BulkAction = OUTBOUND_ACTIONS.has(rawAction)
    ? 'outbound'
    : (rawAction as BulkAction)
  if (!['tags', 'outbound', 'warmup', 'warmup_toggle'].includes(action)) {
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
  let accounts = (Array.isArray(body.accounts) ? body.accounts : [])
    .map(objectValue)
    .filter((account) => {
      const id = Number(account.id)
      const domain = domainFromEmail(account.from_email)
      if (!Number.isInteger(id) || id <= 0 || !domainSet.has(domain)) return false
      if (accountIds.has(id)) return false
      accountIds.add(id)
      return true
    })
  if (snapshotEnabled() && body.resolveFromSnapshot === true) {
    accounts = await rawAccountsForDomains(domains)
  }
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
    // The dashboard works in tag names; Smartlead's bulk endpoint takes tag
    // ids. Resolve here so an unknown name fails before anything is written.
    let known: Awaited<ReturnType<typeof fetchAllTags>>
    try {
      known = await fetchAllTags(jwt)
    } catch (error) {
      return res.status(502).json({
        error: `Could not load Smartlead tags: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
    const idByName = new Map(
      known.map((tag) => [tag.name.toLowerCase(), tag.id]),
    )
    const tagIds: number[] = []
    const missing: string[] = []
    for (const name of tags) {
      const id = idByName.get(name.toLowerCase())
      if (id) tagIds.push(id)
      else missing.push(name)
    }
    if (missing.length > 0) {
      return res.status(400).json({
        error: `No Smartlead tag named ${missing
          .slice(0, 3)
          .map((name) => `"${name}"`)
          .join(', ')}. Create the tag first, then apply it.`,
      })
    }
    updateData = { tags: tagIds }
  } else if (action === 'outbound') {
    // Smartlead replaces the whole outbound block, so both fields must be sent
    // together. Sending only one silently resets the other to a default.
    const settings = objectValue(body.settings)
    const minTimeToWaitInMins = integerInRange(
      settings.minTimeToWaitInMins,
      0,
      1440,
    )
    if (minTimeToWaitInMins === null) {
      return res.status(400).json({
        error: 'Minimum wait must be a whole number from 0 to 1,440 minutes.',
      })
    }
    if (body.preserveMessagePerDay === true) {
      return await applyPreservedOutbound(
        res,
        jwt,
        accounts,
        domains,
        minTimeToWaitInMins,
      )
    }
    const messagePerDay = integerInRange(settings.messagePerDay, 0, 1000)
    if (messagePerDay === null) {
      return res.status(400).json({
        error: 'Max emails per day must be a whole number from 0 to 1,000.',
      })
    }
    updateData = { messagePerDay, minTimeToWaitInMins }
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
      isRampupEnabled: settings.isRampupEnabled === true,
      maxEmailPerDay,
      rampupValue,
      replyRate,
      warmupTagIdentifier,
    }
    // Enable/Disable sends the whole warmup block plus the on/off flag, not the
    // flag alone: Smartlead replaces the warmup block wholesale on every write,
    // exactly as it does for outbound, so a lone flag would reset the rest to
    // defaults. The block sent is the one the operator can see in the card.
    if (action === 'warmup_toggle') {
      const status = String(settings.status ?? '').toUpperCase()
      if (status !== 'ACTIVE' && status !== 'PAUSED') {
        return res.status(400).json({
          error: 'Warmup status must be ACTIVE or PAUSED.',
        })
      }
      updateData.warmupStatus = status
    }
  }

  try {
    const emailAccountIds = accountIdsOf(accounts)
    const outcome = await applyBulkConfig(jwt, emailAccountIds, updateData)
    if (outcome.updated > 0) await markSnapshotStale()

    res.setHeader('cache-control', 'private, max-age=0, no-store')
    if (outcome.failed > 0) {
      // Partial success is reported as a failure so the operator investigates.
      return res.status(502).json({
        success: false,
        error:
          `${outcome.updated} of ${emailAccountIds.length} inboxes updated. ` +
          `${outcome.error ?? 'Smartlead rejected the rest.'}`,
      })
    }
    const verb =
      action === 'warmup_toggle'
        ? `${
            String(objectValue(body.settings).status ?? '').toUpperCase() ===
            'ACTIVE'
              ? 'Enabled'
              : 'Disabled'
          } warmup on`
        : `Updated ${action} for`
    return res.status(200).json({
      success: true,
      message: `${verb} ${outcome.updated} inbox${
        outcome.updated === 1 ? '' : 'es'
      } across ${domains.length} domain${domains.length === 1 ? '' : 's'}.`,
    })
  } catch (error) {
    return res.status(502).json({
      error: `Bulk ${action} update failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}

// ---------------------------------------------------------------------------
// Bulk campaign sender sync
// Kept in this entrypoint so Vercel's ESM runtime has no shared-module import
// to resolve before ordinary email-account requests can run.
// ---------------------------------------------------------------------------

const SMARTLEAD_PUBLIC_API_BASE = `${SMARTLEAD_BASE}/api/v1`
const BULK_PREVIEW_CONCURRENCY = 3
const BULK_EXECUTE_CONCURRENCY = 2
const MAX_BULK_CAMPAIGNS = 25
const MAX_BULK_POOLS = 25
const MAX_ACCOUNTS_PER_POOL = 50_000

interface RawBulkCampaignTarget {
  campaignId?: unknown
  campaignName?: unknown
  tagKey?: unknown
  tagName?: unknown
}

interface RawBulkTagPool {
  tagKey?: unknown
  tagName?: unknown
  accountIds?: unknown
}

interface ValidatedBulkTarget {
  campaignId: number
  campaignName: string
  tagName: string
  desiredAccountIds: number[]
}

function bulkTagKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  )
}

function validateBulkPlan(value: unknown): ValidatedBulkTarget[] {
  const plan = objectValue(value)
  const rawCampaigns = Array.isArray(plan.campaigns)
    ? (plan.campaigns as RawBulkCampaignTarget[])
    : []
  const rawPools = Array.isArray(plan.pools)
    ? (plan.pools as RawBulkTagPool[])
    : []

  if (rawCampaigns.length === 0) {
    throw new Error('No campaigns are eligible for bulk sync.')
  }
  if (rawCampaigns.length > MAX_BULK_CAMPAIGNS) {
    throw new Error(
      `A maximum of ${MAX_BULK_CAMPAIGNS} campaigns can be processed per request.`,
    )
  }
  if (rawPools.length === 0 || rawPools.length > MAX_BULK_POOLS) {
    throw new Error(`Provide between 1 and ${MAX_BULK_POOLS} tag pools.`)
  }

  const pools = new Map<string, { tagName: string; accountIds: number[] }>()
  for (const raw of rawPools) {
    const tagName = String(raw.tagName ?? '').trim()
    const key = bulkTagKey(raw.tagKey)
    const accountIds = positiveIds(raw.accountIds)
    if (!key || key !== bulkTagKey(tagName)) {
      throw new Error('A tag pool has an invalid name or key.')
    }
    if (pools.has(key)) throw new Error(`Duplicate tag pool: ${tagName}.`)
    if (accountIds.length === 0) {
      throw new Error(`The "${tagName}" tag has no connected email accounts.`)
    }
    if (accountIds.length > MAX_ACCOUNTS_PER_POOL) {
      throw new Error(
        `The "${tagName}" tag exceeds the ${MAX_ACCOUNTS_PER_POOL} account safety limit.`,
      )
    }
    pools.set(key, { tagName, accountIds })
  }

  const campaignIds = new Set<number>()
  return rawCampaigns.map((raw) => {
    const campaignId = Number(raw.campaignId)
    const campaignName = String(raw.campaignName ?? '').trim()
    const tagKey = bulkTagKey(raw.tagKey)
    const tagName = String(raw.tagName ?? '').trim()
    const pool = pools.get(tagKey)
    if (!Number.isInteger(campaignId) || campaignId <= 0 || !campaignName) {
      throw new Error('A campaign has an invalid ID or name.')
    }
    if (campaignIds.has(campaignId)) {
      throw new Error(`Campaign ${campaignId} appears more than once.`)
    }
    campaignIds.add(campaignId)
    if (!pool || bulkTagKey(tagName) !== tagKey) {
      throw new Error(`Campaign ${campaignName} references an invalid tag pool.`)
    }
    return {
      campaignId,
      campaignName: campaignName.slice(0, 300),
      tagName: pool.tagName,
      desiredAccountIds: pool.accountIds,
    }
  })
}

async function bulkSmartleadRequest(
  apiKey: string,
  campaignId: number,
  method: 'GET' | 'POST' | 'DELETE',
  accountIds?: number[],
): Promise<unknown> {
  const url = `${SMARTLEAD_PUBLIC_API_BASE}/campaigns/${campaignId}/email-accounts?api_key=${encodeURIComponent(apiKey)}${
    method === 'GET' ? '&include_tags=true' : ''
  }`
  const upstream = await fetch(url, {
    method,
    headers: accountIds ? { 'content-type': 'application/json' } : undefined,
    body: accountIds
      ? JSON.stringify({ email_account_ids: accountIds })
      : undefined,
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    const detail = text.trim().slice(0, 400)
    throw new Error(
      `Smartlead ${method} failed (${upstream.status})${detail ? `: ${detail}` : '.'}`,
    )
  }
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function extractCampaignAccountIds(payload: unknown): number[] {
  const root = objectValue(payload)
  const data = root.data
  let rows: unknown[] = []
  if (Array.isArray(payload)) rows = payload
  else if (Array.isArray(data)) rows = data
  else if (Array.isArray(objectValue(data).email_accounts)) {
    rows = objectValue(data).email_accounts as unknown[]
  } else if (Array.isArray(root.email_accounts)) {
    rows = root.email_accounts
  }
  return positiveIds(rows.map((row) => objectValue(row).id))
}

async function currentCampaignAccountIds(
  apiKey: string,
  campaignId: number,
): Promise<number[]> {
  return extractCampaignAccountIds(
    await bulkSmartleadRequest(apiKey, campaignId, 'GET'),
  )
}

function bulkDiff(currentIds: number[], desiredIds: number[]) {
  const current = new Set(currentIds)
  const desired = new Set(desiredIds)
  return {
    toAdd: desiredIds.filter((id) => !current.has(id)),
    toRemove: currentIds.filter((id) => !desired.has(id)),
  }
}

async function bulkMapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = nextIndex++
        if (index >= items.length) return
        results[index] = await worker(items[index])
      }
    },
  )
  await Promise.all(runners)
  return results
}

async function previewBulkTargets(
  apiKey: string,
  targets: ValidatedBulkTarget[],
) {
  return bulkMapWithConcurrency(
    targets,
    BULK_PREVIEW_CONCURRENCY,
    async (target) => {
      try {
        const currentIds = await currentCampaignAccountIds(
          apiKey,
          target.campaignId,
        )
        const { toAdd, toRemove } = bulkDiff(
          currentIds,
          target.desiredAccountIds,
        )
        return {
          campaignId: target.campaignId,
          campaignName: target.campaignName,
          tagName: target.tagName,
          currentCount: currentIds.length,
          desiredCount: target.desiredAccountIds.length,
          toAddCount: toAdd.length,
          toRemoveCount: toRemove.length,
        }
      } catch (error) {
        return {
          campaignId: target.campaignId,
          campaignName: target.campaignName,
          tagName: target.tagName,
          currentCount: 0,
          desiredCount: target.desiredAccountIds.length,
          toAddCount: 0,
          toRemoveCount: 0,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}

async function executeBulkTargets(
  apiKey: string,
  targets: ValidatedBulkTarget[],
) {
  return bulkMapWithConcurrency(
    targets,
    BULK_EXECUTE_CONCURRENCY,
    async (target) => {
      let added = 0
      let removed = 0
      try {
        // Re-read immediately before writing; never trust a stale preview.
        const currentIds = await currentCampaignAccountIds(
          apiKey,
          target.campaignId,
        )
        const { toAdd, toRemove } = bulkDiff(
          currentIds,
          target.desiredAccountIds,
        )
        if (toAdd.length === 0 && toRemove.length === 0) {
          return {
            campaignId: target.campaignId,
            campaignName: target.campaignName,
            tagName: target.tagName,
            status: 'unchanged' as const,
            added,
            removed,
          }
        }

        // Add first so an active campaign is never empty mid-sync.
        if (toAdd.length > 0) {
          await bulkSmartleadRequest(apiKey, target.campaignId, 'POST', toAdd)
          added = toAdd.length
        }
        if (toRemove.length > 0) {
          await bulkSmartleadRequest(
            apiKey,
            target.campaignId,
            'DELETE',
            toRemove,
          )
          removed = toRemove.length
        }

        return {
          campaignId: target.campaignId,
          campaignName: target.campaignName,
          tagName: target.tagName,
          status: 'synced' as const,
          added,
          removed,
        }
      } catch (error) {
        return {
          campaignId: target.campaignId,
          campaignName: target.campaignName,
          tagName: target.tagName,
          status: 'error' as const,
          added,
          removed,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}

async function handleBulkSync(req: VercelRequest, res: VercelResponse) {
  const apiKey =
    process.env.SMARTLEAD_API_KEY ||
    (req.headers['x-smartlead-api-key'] as string) ||
    ''
  if (!apiKey) {
    return res.status(400).json({
      error:
        'Bulk Sync requires SMARTLEAD_API_KEY in the Vercel environment variables.',
    })
  }

  try {
    const body = objectValue(req.body)
    const action = String(body.action ?? '')
    if (action !== 'preview' && action !== 'execute') {
      return res.status(400).json({ error: 'Action must be preview or execute.' })
    }
    const targets = validateBulkPlan(body.plan)
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    if (action === 'preview') {
      return res
        .status(200)
        .json({ previews: await previewBulkTargets(apiKey, targets) })
    }
    return res
      .status(200)
      .json({ results: await executeBulkTargets(apiKey, targets) })
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// GET /api/email-accounts?offset=0
// Proxies one page of in-use email accounts (limit fixed at 100).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = objectValue(req.body)
  if (
    req.method === 'POST' &&
    String(body.mode ?? '') === 'bulk-sync'
  ) {
    return handleBulkSync(req, res)
  }

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
      String(body.mode ?? '') === 'create-tag'
    ) {
      return await createTag(req, res, jwt)
    }
    if (
      req.method === 'POST' &&
      String(body.mode ?? '') === 'delete-tag'
    ) {
      return await deleteTag(req, res, jwt)
    }
    if (
      req.method === 'POST' &&
      String(body.mode ?? '') === 'validate-dns'
    ) {
      return await runBulkEmailAccountAction(
        res,
        jwt,
        '/api/email-account/bulk-verify-domain-email-configurations',
      )
    }
    if (
      req.method === 'POST' &&
      String(body.mode ?? '') === 'bulk-reconnect'
    ) {
      return await runBulkEmailAccountAction(
        res,
        jwt,
        '/api/email-account/bulk-save-failed-email-accounts',
      )
    }
    if (
      req.method === 'POST' &&
      String(body.mode ?? '') === 'bulk-delete'
    ) {
      return await bulkDeleteEmailAccounts(req, res, jwt)
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
