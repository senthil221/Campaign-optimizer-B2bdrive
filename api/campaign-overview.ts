import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// GET /api/campaign-overview?id=123
// Proxies Smartlead's analytics overview for one campaign. Unlike
// get-campaign-analytics, this returns cumulative counters (unique_sent_count)
// and a progress breakdown that survive lead deletion — so progress stays
// accurate even after completed leads are removed from a campaign.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables, or pass a JWT from the UI.',
    })
  }

  const id = Number(req.query.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Provide a numeric ?id=<campaignId>.' })
  }

  try {
    const upstream = await fetch(
      `${SMARTLEAD_BASE}/api/email-campaigns/${id}/analytics/overview`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
      },
    )
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', 'application/json; charset=utf-8')
    return res.send(text)
  } catch (e) {
    res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
