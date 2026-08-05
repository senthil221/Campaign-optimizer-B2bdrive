import type { VercelRequest, VercelResponse } from '@vercel/node'

const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'
const PAGE_LIMIT = 100
const MAX_PAGES = 200
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

interface UpstreamTag {
  created_at?: unknown
  id?: unknown
  name?: unknown
  color?: unknown
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeTag(value: UpstreamTag) {
  return {
    id: Number(value.id) || 0,
    name: String(value.name ?? '').trim(),
    color: String(value.color ?? '').trim() || '#B1FCFA',
    createdAt: String(value.created_at ?? '').trim() || null,
  }
}

async function graphqlRequest(
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

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await graphqlRequest(jwt, {
      operationName: 'getPaginatedTags',
      variables: {
        offset: page * PAGE_LIMIT,
        limit: PAGE_LIMIT,
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
    if (rows.length < PAGE_LIMIT) {
      res.setHeader('cache-control', 'private, max-age=0, no-store')
      return res.status(200).json({ tags })
    }
  }

  return res.status(502).json({
    error: `Tag loading stopped after ${MAX_PAGES * PAGE_LIMIT} rows.`,
  })
}

async function createTag(req: VercelRequest, res: VercelResponse, jwt: string) {
  const name = String(objectValue(req.body).name ?? '').trim()
  if (!name || name.length > 100) {
    return res.status(400).json({
      error: 'Tag name must be between 1 and 100 characters.',
    })
  }
  const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
  const data = await graphqlRequest(jwt, {
    operationName: 'createTag',
    variables: { object: { name, color } },
    query: CREATE_TAG_MUTATION,
  })
  const rawTag = objectValue(data.insert_tags_one) as UpstreamTag
  const tag = normalizeTag(rawTag)
  if (!tag.id || !tag.name) {
    return res.status(502).json({
      error: 'Smartlead created the tag but returned an incomplete response.',
    })
  }
  res.setHeader('cache-control', 'private, max-age=0, no-store')
  return res.status(201).json({ tag })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT ||
    (req.headers['x-smartlead-jwt'] as string) ||
    ''
  if (!jwt) {
    return res.status(400).json({
      error: 'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel Settings.',
    })
  }

  try {
    if (req.method === 'GET') return await listTags(res, jwt)
    if (req.method === 'POST') return await createTag(req, res, jwt)
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' })
  } catch (error) {
    return res.status(502).json({
      error: `Tag Manager request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}
