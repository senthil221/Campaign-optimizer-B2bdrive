const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const SMARTLEAD_V2_BASE = 'https://sl-fe-v2.smartlead.ai'

type Json = Record<string, unknown>

function obj(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {}
}

function preview(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text
}

/** A Smartlead failure, carrying the status to relay to the dashboard. */
export class UpstreamError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** One campaign's settings, as GET /api/email-campaigns/{id}/settings returns. */
export async function fetchCampaignSettings(jwt: string, id: number): Promise<Json> {
  const upstream = await fetch(`${SMARTLEAD_BASE}/api/email-campaigns/${id}/settings`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    throw new UpstreamError(
      upstream.status,
      `Smartlead settings request failed (${upstream.status}) for campaign ${id}. Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new UpstreamError(
      502,
      `Smartlead settings for campaign ${id} were not JSON. Response: ${preview(text)}`,
    )
  }
  const data = obj(obj(json).data)
  if (Object.keys(data).length === 0) {
    throw new UpstreamError(502, `Smartlead settings for campaign ${id} had no data object.`)
  }
  return data
}

/**
 * PATCH /api/v1/campaigns/{id} on the v2 host. Smartlead's own UI saves one
 * settings section at a time, so fields left out keep their current values.
 */
export async function patchCampaign(jwt: string, id: number, body: Json): Promise<void> {
  const upstream = await fetch(`${SMARTLEAD_V2_BASE}/api/v1/campaigns/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await upstream.text()
  let payload: Json = {}
  try {
    payload = obj(JSON.parse(text))
  } catch {
    // Judged by status below.
  }
  if (!upstream.ok || payload.success === false) {
    throw new UpstreamError(
      upstream.ok ? 502 : upstream.status,
      String(obj(payload.error).message ?? '') ||
        `Smartlead rejected the update to campaign ${id} (${upstream.status}). Response: ${preview(text)}`,
    )
  }
}

/** JSON with object keys sorted, so two reads of one value compare equal. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Json).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

/** Keys (other than `except`) whose values differ between two settings reads. */
export function changedSettings(before: Json, after: Json, except: string): string[] {
  return Object.keys(before).filter(
    (key) => key !== except && stable(before[key]) !== stable(after[key]),
  )
}
