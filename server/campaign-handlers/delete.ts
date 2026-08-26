import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  CAMPAIGN_CONCURRENCY,
  callCampaign,
  campaignIdsFromBody,
  mapWithConcurrency,
} from './fanout.js'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// POST /api/campaign-actions?action=delete  { ids: number[] }
// Permanently deletes campaigns via DELETE /api/v1/campaigns/{id}. Partial
// failures are reported per campaign rather than collapsed into one error, so
// the caller can tell which campaigns are actually gone.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  const apiKey =
    process.env.SMARTLEAD_API_KEY ||
    (req.headers['x-smartlead-api-key'] as string) ||
    ''
  if (!jwt && !apiKey) {
    return res.status(400).json({
      error:
        'No Smartlead credentials configured. Set SMARTLEAD_JWT or SMARTLEAD_API_KEY.',
    })
  }

  const ids = campaignIdsFromBody(req.body as Record<string, unknown>, res)
  if (!ids) return

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`

  const outcomes = await mapWithConcurrency(ids, CAMPAIGN_CONCURRENCY, (id) =>
    callCampaign(
      id,
      apiKey
        ? `${SMARTLEAD_BASE}/api/v1/campaigns/${id}?api_key=${encodeURIComponent(apiKey)}`
        : `${SMARTLEAD_BASE}/api/v1/campaigns/${id}`,
      { method: 'DELETE', headers },
    ),
  )

  const deleted = outcomes.filter((outcome) => outcome.ok).map((o) => o.id)
  const failed = outcomes.filter((outcome) => !outcome.ok)

  res.setHeader('cache-control', 'private, max-age=0, no-store')
  // Anything less than a clean sweep is a non-2xx so the operator investigates,
  // but the deleted ids still travel back so the table can drop those rows.
  return res.status(failed.length > 0 ? 502 : 200).json({
    success: failed.length === 0,
    deleted,
    failed: failed.map(({ id, error }) => ({ id, error })),
    message:
      failed.length === 0
        ? `Deleted ${deleted.length} campaign${deleted.length === 1 ? '' : 's'}.`
        : `${deleted.length} of ${ids.length} campaigns deleted. ${
            failed[0].error ?? 'Smartlead rejected the rest.'
          }`,
  })
}
