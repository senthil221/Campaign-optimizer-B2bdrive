import type { VercelRequest, VercelResponse } from '@vercel/node'

// Smartlead's internal Hasura GraphQL endpoint (same JWT as the other proxies).
const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'

const READ_QUERY = `query getMaxLeads($ids: [Int!]!) {
  email_campaigns(where: {id: {_in: $ids}}) {
    id
    max_leads_per_day
  }
}`

// Hasura _set is a PARTIAL update: only max_leads_per_day changes; cron_exp,
// scheduler_cron_value and min_time_btwn_emails are left exactly as they were.
const UPDATE_MUTATION = `mutation updateMaxLeads($id: Int!, $value: Int!) {
  update_email_campaigns_by_pk(pk_columns: {id: $id}, _set: {max_leads_per_day: $value}) {
    id
    max_leads_per_day
    __typename
  }
}`

async function callGraphql(
  jwt: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Response> {
  return fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
}

// GET  /api/campaign-schedule?ids=1,2,3   → current max_leads_per_day per campaign
// POST /api/campaign-schedule { id, maxLeadsPerDay } → update just that field
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }

  try {
    if (req.method === 'GET') {
      const idsRaw = String(req.query.ids ?? '')
      const ids = idsRaw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Provide ?ids=1,2,3' })
      }
      const upstream = await callGraphql(jwt, READ_QUERY, { ids })
      const text = await upstream.text()
      res.status(upstream.status)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.send(text)
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>
      const id = Number(body.id)
      const value = Number(body.maxLeadsPerDay)
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Body must include a numeric "id".' })
      }
      if (!Number.isFinite(value) || value < 0) {
        return res
          .status(400)
          .json({ error: 'Body must include a non-negative "maxLeadsPerDay".' })
      }
      const upstream = await callGraphql(jwt, UPDATE_MUTATION, {
        id,
        value: Math.round(value),
      })
      const text = await upstream.text()
      res.status(upstream.status)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.send(text)
    }

    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' })
  } catch (e) {
    res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
