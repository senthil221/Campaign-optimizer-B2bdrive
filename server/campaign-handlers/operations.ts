import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  CAMPAIGN_CONCURRENCY,
  callCampaign,
  campaignIdsFromBody,
  mapWithConcurrency,
} from './fanout.js'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// Maintenance actions Smartlead exposes per campaign on its internal API. These
// live under /api/email-campaigns (JWT bearer), not the api-key /api/v1 routes.
const OPERATIONS = {
  'reallocate-mailboxes': {
    path: 'reallocate-mailboxes',
    verb: 'Reallocated mailboxes for',
  },
  'reschedule-failed-leads': {
    path: 'reschedule-failed-leads',
    verb: 'Rescheduled failed leads for',
  },
} as const

type OperationName = keyof typeof OPERATIONS

function isOperation(value: string): value is OperationName {
  return Object.prototype.hasOwnProperty.call(OPERATIONS, value)
}

// POST /api/campaign-actions?action=operation  { ids: number[], operation }
// Runs one per-campaign maintenance action across a selection. Partial failures
// are reported per campaign so the caller can retry only what did not land.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel -> Settings -> Environment Variables.',
    })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const operation = String(body.operation ?? '')
  if (!isOperation(operation)) {
    return res.status(400).json({
      error: `Unknown campaign operation "${operation}". Expected one of: ${Object.keys(
        OPERATIONS,
      ).join(', ')}.`,
    })
  }

  const ids = campaignIdsFromBody(body, res)
  if (!ids) return

  const { path, verb } = OPERATIONS[operation]
  const outcomes = await mapWithConcurrency(ids, CAMPAIGN_CONCURRENCY, (id) =>
    callCampaign(id, `${SMARTLEAD_BASE}/api/email-campaigns/${id}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    }),
  )

  const succeeded = outcomes.filter((outcome) => outcome.ok).map((o) => o.id)
  const failed = outcomes.filter((outcome) => !outcome.ok)

  res.setHeader('cache-control', 'private, max-age=0, no-store')
  // Anything short of a clean sweep is a non-2xx so the operator investigates,
  // but the succeeded ids still travel back so the UI can clear those.
  return res.status(failed.length > 0 ? 502 : 200).json({
    success: failed.length === 0,
    succeeded,
    failed: failed.map(({ id, error }) => ({ id, error })),
    message:
      failed.length === 0
        ? `${verb} ${succeeded.length} campaign${succeeded.length === 1 ? '' : 's'}.`
        : `${verb} ${succeeded.length} of ${ids.length} campaigns. ${
            failed[0].error ?? 'Smartlead rejected the rest.'
          }`,
  })
}
