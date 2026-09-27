import type { VercelRequest, VercelResponse } from '@vercel/node'
import { UpstreamError, fetchCampaignSettings } from './_lib/campaign-settings.js'
import { smartleadJwt } from './_lib/smartlead-jwt.js'

// GET /api/campaign-general-settings?id=123
//   → { id, max_leads_per_day, send_as_plain_text, force_plain_text, track_settings }
// Smartlead's settings endpoint is per campaign, so the dashboard fans out one
// request per campaign. One read feeds both max leads/day and the plain-text /
// tracking flags, which the retired GraphQL host served as two batched queries.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = smartleadJwt(req)
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  const id = Number(req.query.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Provide a numeric ?id=<campaignId>.' })
  }

  try {
    const settings = await fetchCampaignSettings(jwt, id)
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({
      id,
      max_leads_per_day: settings.max_leads_per_day ?? null,
      send_as_plain_text: settings.send_as_plain_text ?? null,
      force_plain_text: settings.force_plain_text ?? null,
      track_settings: settings.track_settings ?? null,
    })
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502
    return res.status(status).json({
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
