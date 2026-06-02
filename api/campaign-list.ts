import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SMARTLEAD_BASE, resolveJwt, pipe, noJwt } from './_lib'

// GET /api/campaign-list
// Proxies the Smartlead campaign list (ids + names + status).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = resolveJwt(req)
  if (!jwt) return noJwt(res)

  const url = `${SMARTLEAD_BASE}/api/email-campaigns`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}` },
    })
    await pipe(res, upstream)
  } catch (e) {
    res
      .status(502)
      .json({ error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}` })
  }
}
