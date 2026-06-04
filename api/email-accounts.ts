import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// GET /api/email-accounts?offset=0
// Proxies one page of in-use email accounts (limit fixed at 100).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables, or pass a JWT from the UI.',
    })
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
