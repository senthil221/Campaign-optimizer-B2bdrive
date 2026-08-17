import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// Statuses the Smartlead status endpoint accepts. START resumes a paused
// campaign (Smartlead reports it back as ACTIVE).
const ALLOWED = new Set(['START', 'PAUSED', 'STOPPED'])

// POST /api/campaign-status  { id, status }
// Pauses / resumes / stops a campaign via POST /api/v1/campaigns/{id}/status.
// Prefers an api key (the v1 REST endpoint is api-key based); falls back to the
// JWT bearer token when only a JWT is configured.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  const apiKey =
    process.env.SMARTLEAD_API_KEY ||
    (req.headers['x-smartlead-api-key'] as string) ||
    ''

  if (!jwt && !apiKey) {
    return res.status(400).json({
      error:
        'No Smartlead credentials configured. Set SMARTLEAD_JWT or SMARTLEAD_API_KEY.',
    })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const id = Number(body.id)
  const status = String(body.status ?? '').toUpperCase()

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Body must include a numeric "id".' })
  }
  if (!ALLOWED.has(status)) {
    return res
      .status(400)
      .json({ error: 'status must be one of START, PAUSED, STOPPED.' })
  }

  const url = apiKey
    ? `${SMARTLEAD_BASE}/api/v1/campaigns/${id}/status?api_key=${encodeURIComponent(apiKey)}`
    : `${SMARTLEAD_BASE}/api/v1/campaigns/${id}/status`

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status }),
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
