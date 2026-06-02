import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SMARTLEAD_BASE, resolveJwt, pipe, noJwt } from './_lib'

// POST /api/campaign-analytics  body: { campaign_ids: "{id1,id2,...}" }
// Proxies one analytics batch to Smartlead.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt = resolveJwt(req)
  if (!jwt) return noJwt(res)

  const body = req.body ?? {}
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
    await pipe(res, upstream)
  } catch (e) {
    res
      .status(502)
      .json({ error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}` })
  }
}
