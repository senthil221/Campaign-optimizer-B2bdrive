import type { VercelRequest, VercelResponse } from '@vercel/node'

// Smartlead's internal Hasura GraphQL endpoint (same JWT as the other proxies).
const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'

// Mirrors the getCampaignGeneralSettings query captured from Smartlead's own
// UI, trimmed to just the fields the dashboard surfaces (plain text send,
// forced plain text, and open/click tracking — the last two live inside
// track_settings, an array of Smartlead's internal disable-flags).
const READ_QUERY = `query getCampaignGeneralSettings($ids: [Int!]!) {
  email_campaigns(where: {id: {_in: $ids}}) {
    id
    send_as_plain_text
    force_plain_text
    track_settings
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

// GET /api/campaign-general-settings?ids=1,2,3
//   → { data: { email_campaigns: [{ id, send_as_plain_text, force_plain_text, track_settings }] } }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
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
  } catch (e) {
    return res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
