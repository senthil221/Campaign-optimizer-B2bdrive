import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SMARTLEAD_BASE, resolveJwt, pipe, noJwt } from './_lib'

// GET /api/email-accounts?offset=0
// Proxies one page of in-use email accounts (limit fixed at 100).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = resolveJwt(req)
  if (!jwt) return noJwt(res)

  const offset = Number(req.query.offset ?? 0) || 0
  const url = `${SMARTLEAD_BASE}/api/email-account/get-total-email-accounts?offset=${offset}&limit=100&isInUse=true`

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
