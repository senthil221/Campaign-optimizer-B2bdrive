import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/domain-health?start=YYYY-MM-DD&end=YYYY-MM-DD
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error: 'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel environment variables.',
    })
  }

  const start = String(req.query.start ?? '')
  const end = String(req.query.end ?? '')
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
    return res.status(400).json({
      error: 'Provide a valid date range with ?start=YYYY-MM-DD&end=YYYY-MM-DD.',
    })
  }

  const params = new URLSearchParams({
    start_date: start,
    end_date: end,
    timezone: 'Etc/GMT',
    full_data: 'true',
  })

  try {
    const upstream = await fetch(
      `${SMARTLEAD_BASE}/api/analytics/mailbox/domain-wise-health-metrics?${params}`,
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
