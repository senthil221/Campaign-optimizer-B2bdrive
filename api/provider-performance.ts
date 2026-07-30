import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Server-side proxy for the provider/tag analytics used by Tag Overview.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error: 'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel environment variables.',
    })
  }

  const date = String(req.query.date ?? '')
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Provide ?date=YYYY-MM-DD.' })
  }

  const params = new URLSearchParams({
    start_date: date,
    end_date: date,
    // Match the exact timezone used by Smartlead's own analytics request.
    timezone: 'Etc/GMT',
    full_data: 'true',
  })

  try {
    const upstream = await fetch(
      `${SMARTLEAD_BASE}/api/analytics/mailbox/provider-wise-overall-performance?${params}`,
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
    return res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
