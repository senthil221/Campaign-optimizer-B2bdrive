import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// POST /api/campaign-analytics  body: { campaign_ids: "{id1,id2,...}" }
// Proxies one analytics batch to Smartlead.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables, or pass a JWT from the UI.',
    })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  if (!body || typeof body !== 'object' || !('campaign_ids' in body)) {
    return res.status(400).json({
      error:
        'Missing campaign_ids. Body must be { "campaign_ids": "{id1,id2,...}" }.',
    })
  }

  try {
    const upstream = await fetch(
      `${SMARTLEAD_BASE}/api/email-campaigns/get-campaign-analytics`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
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
