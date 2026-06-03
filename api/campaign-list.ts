import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// GET /api/campaign-list?offset=0
// Returns one page of campaigns (id + name + status + campaign_tags_mappings).
// Prefers the JWT internal endpoint (which includes campaign tags); falls back
// to the api-key public endpoint (no tags) only when no JWT is available.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  const apiKey =
    process.env.SMARTLEAD_API_KEY ||
    (req.headers['x-smartlead-api-key'] as string) ||
    ''

  const offset = Number(req.query.offset ?? 0) || 0
  const limit = 100

  let url: string
  const headers: Record<string, string> = {}

  if (jwt) {
    url = `${SMARTLEAD_BASE}/api/email-campaigns/get-all-campaigns?offset=${offset}&limit=${limit}&statusNot=ARCHIVED&parentCampaignId=null`
    headers.Authorization = `Bearer ${jwt}`
  } else if (apiKey) {
    url = `${SMARTLEAD_BASE}/api/v1/campaigns?api_key=${encodeURIComponent(apiKey)}`
  } else {
    return res.status(400).json({
      error:
        'Provide a JWT (SMARTLEAD_JWT) or an API key (SMARTLEAD_API_KEY) to list campaigns.',
    })
  }

  try {
    const upstream = await fetch(url, { method: 'GET', headers })
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
