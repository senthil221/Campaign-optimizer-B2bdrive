import type { VercelResponse } from '@vercel/node'

// These run one HTTP call per campaign upstream, so a request is capped and the
// calls go out a few at a time rather than all at once.
export const MAX_CAMPAIGN_IDS = 100
export const CAMPAIGN_CONCURRENCY = 3

export interface FanoutOutcome {
  id: number
  ok: boolean
  error?: string
}

/** Trim an upstream body down to something readable in a UI notice. */
export function preview(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await fn(items[index])
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * Parse and validate the `ids` array shared by every campaign fan-out action.
 * Returns null after writing the error response.
 */
export function campaignIdsFromBody(
  body: Record<string, unknown>,
  res: VercelResponse,
): number[] | null {
  const ids = Array.from(
    new Set(
      (Array.isArray(body.ids) ? body.ids : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  )
  if (ids.length === 0) {
    res.status(400).json({ error: 'Body must include a non-empty "ids" array.' })
    return null
  }
  if (ids.length > MAX_CAMPAIGN_IDS) {
    res.status(400).json({
      error: `Act on at most ${MAX_CAMPAIGN_IDS} campaigns per request (got ${ids.length}).`,
    })
    return null
  }
  return ids
}

/**
 * One campaign's upstream call, normalized. A 2xx body carrying `ok: false` or
 * `success: false` counts as a failure, which Smartlead does return.
 */
export async function callCampaign(
  id: number,
  url: string,
  init: RequestInit,
): Promise<FanoutOutcome> {
  try {
    const upstream = await fetch(url, init)
    const text = await upstream.text()
    if (!upstream.ok) {
      return {
        id,
        ok: false,
        error: `${upstream.status} ${upstream.statusText}: ${preview(text)}`,
      }
    }
    try {
      const payload = JSON.parse(text) as Record<string, unknown>
      if (payload && (payload.ok === false || payload.success === false)) {
        return {
          id,
          ok: false,
          error:
            String(payload.message ?? payload.error ?? '').trim() ||
            'Smartlead reported the request as unsuccessful.',
        }
      }
    } catch {
      // Non-JSON 2xx body. Smartlead returns plain text on some routes.
    }
    return { id, ok: true }
  } catch (e) {
    return { id, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
