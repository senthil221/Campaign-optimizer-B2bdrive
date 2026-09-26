import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  UpstreamError,
  changedSettings,
  fetchCampaignSettings,
  patchCampaign,
} from './_lib/campaign-settings.js'

// POST /api/campaign-schedule { id, maxLeadsPerDay } → change only that field.
//
// Smartlead's own UI saves settings a section at a time, and its general-
// settings save leaves the schedule untouched, so a one-field PATCH should too.
// That is inferred rather than captured, so the campaign is read before and
// after: the write only reports success if the new value landed and no other
// setting moved.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const id = Number(body.id)
  const value = Math.round(Number(body.maxLeadsPerDay))
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Body must include a numeric "id".' })
  }
  if (!Number.isFinite(value) || value < 0) {
    return res
      .status(400)
      .json({ error: 'Body must include a non-negative "maxLeadsPerDay".' })
  }

  try {
    const before = await fetchCampaignSettings(jwt, id)
    // Smartlead's own save sends this value as a string.
    await patchCampaign(jwt, id, { max_leads_per_day: String(value) })

    let after: Record<string, unknown>
    try {
      after = await fetchCampaignSettings(jwt, id)
    } catch (e) {
      return res.status(502).json({
        error: `Max leads/day was sent to Smartlead, but campaign ${id} could not be re-read to confirm it: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }

    if (Number(after.max_leads_per_day) !== value) {
      return res.status(502).json({
        error: `Smartlead accepted the update, but campaign ${id} still reports max leads/day of ${String(
          after.max_leads_per_day,
        )}.`,
      })
    }
    const moved = changedSettings(before, after, 'max_leads_per_day')
    if (moved.length > 0) {
      return res.status(502).json({
        error: `Max leads/day was saved, but Smartlead also changed ${moved.join(
          ', ',
        )} on campaign ${id}. Check that campaign's settings in Smartlead.`,
      })
    }

    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({ success: true, id, max_leads_per_day: value })
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502
    return res.status(status).json({
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
