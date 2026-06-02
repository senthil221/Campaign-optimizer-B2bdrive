import type {
  Campaign,
  EmailAccount,
  LoadCampaignsResult,
  RawCampaignAnalytics,
  RawCampaignListItem,
  RawEmailAccount,
} from '../types'
import { num } from '../utils/campaignCalculations'

// Same-origin serverless proxy (see /api/*). The proxy injects the Smartlead
// JWT from a server-side env var, so no secret is exposed in the browser and
// there is no cross-origin (CORS) call from the client.
const EMAIL_ACCOUNTS_URL = '/api/email-accounts'
const CAMPAIGN_LIST_URL = '/api/campaign-list'
const CAMPAIGN_ANALYTICS_URL = '/api/campaign-analytics'

const PAGE_LIMIT = 100
const ANALYTICS_CHUNK = 50
const REQUEST_DELAY_MS = 300
const MAX_PAGES = 200 // safety cap (20k accounts)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Optional JWT override → forwarded to the proxy as a header. When empty, the
// proxy falls back to its server-side SMARTLEAD_JWT env var.
function authHeaders(jwt: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['x-smartlead-jwt'] = jwt
  return headers
}

function preview(value: unknown, max = 600): string {
  let s: string
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    s = String(value)
  }
  return s.length > max ? `${s.slice(0, max)}… (truncated)` : s
}

/**
 * Dig an array out of whichever envelope Smartlead returns, without throwing.
 * Tries: top-level array, top-level keys, data array, data.<keys>, data.results.
 */
function extractArray(json: unknown, keys: string[]): unknown[] | null {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return null

  const obj = json as Record<string, unknown>
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }

  const data = obj.data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.results)) return d.results as unknown[]
    for (const key of keys) {
      if (Array.isArray(d[key])) return d[key] as unknown[]
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Normalization (never crashes on missing fields)
// ---------------------------------------------------------------------------

export function normalizeEmailAccount(raw: RawEmailAccount): EmailAccount {
  const tagIds: number[] = []
  const tagNames: string[] = []

  const mappings = Array.isArray(raw?.email_account_tag_mappings)
    ? raw.email_account_tag_mappings
    : []
  for (const mapping of mappings) {
    const tag = mapping?.tag
    if (tag && tag.name) {
      tagIds.push(num(tag.id, 0))
      tagNames.push(String(tag.name))
    }
  }

  const warmup = raw?.email_warmup_details ?? {}

  return {
    id: num(raw?.id, 0),
    fromEmail: String(raw?.from_email ?? ''),
    messagePerDay: num(raw?.message_per_day, 0),
    dailySentCount: num(raw?.daily_sent_count, 0),
    warmupStatus: String(warmup?.status ?? 'UNKNOWN'),
    warmupReputation: num(warmup?.warmup_reputation, 0),
    tagIds,
    tagNames,
  }
}

export function normalizeCampaign(
  raw: RawCampaignAnalytics,
  nameInfo: { name: string; status: string } | undefined,
): Campaign {
  const stats = raw?.campaign_lead_stats ?? {}
  const id = num(raw?.id, 0)
  return {
    campaignId: id,
    campaignName: nameInfo?.name ?? `Campaign ${id}`,
    nameMissing: !nameInfo?.name,
    sentCount: num(raw?.sent_count, 0),
    replyCount: num(raw?.reply_count, 0),
    oooReplyCount: num(raw?.ooo_reply_count, 0),
    bounceCount: num(raw?.bounce_count, 0),
    totalCount: num(raw?.total_count, 0),
    draftedCount: num(raw?.drafted_count, 0),
    status: String(nameInfo?.status ?? raw?.status ?? ''),
    leadStats: {
      total: num(stats?.total, 0),
      completed: num(stats?.completed, 0),
      inprogress: num(stats?.inprogress, 0),
      notStarted: num(stats?.notStarted, 0),
      paused: num(stats?.paused, 0),
      blocked: num(stats?.blocked, 0),
      stopped: num(stats?.stopped, 0),
      senderBounced: num(stats?.senderBounced, 0),
    },
  }
}

function dedupeAccounts(accounts: EmailAccount[]): EmailAccount[] {
  const seen = new Map<number, EmailAccount>()
  for (const acc of accounts) {
    if (acc.id && !seen.has(acc.id)) seen.set(acc.id, acc)
  }
  return Array.from(seen.values())
}

// ---------------------------------------------------------------------------
// Email accounts / tags
// ---------------------------------------------------------------------------

/**
 * Fetch ALL in-use email accounts, paginating with offset += 100.
 * Stops when a page returns no accounts (or the safety cap is reached).
 */
export async function fetchEmailAccounts(jwt: string): Promise<EmailAccount[]> {
  const all: EmailAccount[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT
    const url = `${EMAIL_ACCOUNTS_URL}?offset=${offset}`

    const res = await fetch(url, { method: 'GET', headers: authHeaders(jwt) })
    const text = await res.text()

    if (!res.ok) {
      throw new Error(
        `Email accounts request failed (${res.status} ${res.statusText}) at offset ${offset}. Response: ${preview(text)}`,
      )
    }

    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(
        `Email accounts response was not valid JSON at offset ${offset}. Response: ${preview(text)}`,
      )
    }

    const rows = extractArray(json, ['email_accounts'])
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      all.push(normalizeEmailAccount(row as RawEmailAccount))
    }

    if (rows.length < PAGE_LIMIT) break // last partial page
    await delay(REQUEST_DELAY_MS)
  }

  return dedupeAccounts(all)
}

// ---------------------------------------------------------------------------
// Campaign list (ids + names)
// ---------------------------------------------------------------------------

/**
 * Fetch the campaign list to obtain campaign IDs + names + status.
 * Best-effort: returns [] on a recognizable-but-empty shape; throws only on
 * a transport/HTTP error so the caller can decide whether to warn or fail.
 */
export async function fetchCampaignList(
  jwt: string,
): Promise<RawCampaignListItem[]> {
  const res = await fetch(CAMPAIGN_LIST_URL, {
    method: 'GET',
    headers: authHeaders(jwt),
  })
  const text = await res.text()

  if (!res.ok) {
    throw new Error(
      `Campaign list request failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }

  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `Campaign list response was not valid JSON. Response: ${preview(text)}`,
    )
  }

  const rows = extractArray(json, ['campaigns', 'email_campaigns', 'results'])
  if (!rows) return []

  return rows.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    return {
      id: num(o.id, 0),
      name: o.name != null ? String(o.name) : null,
      status: o.status != null ? String(o.status) : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Campaign analytics (chunked)
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * POST campaign IDs to get-campaign-analytics in batches of ANALYTICS_CHUNK.
 * campaign_ids MUST be a curly-brace wrapped string: "{id1,id2,id3}".
 * Throws with the exact server error / raw response preview on failure.
 */
export async function fetchCampaignAnalytics(
  jwt: string,
  ids: number[],
): Promise<RawCampaignAnalytics[]> {
  if (ids.length === 0) {
    throw new Error('No campaign IDs available to fetch analytics for.')
  }

  const merged = new Map<number, RawCampaignAnalytics>()
  const batches = chunk(ids, ANALYTICS_CHUNK)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const campaignIds = `{${batch.join(',')}}`

    const res = await fetch(CAMPAIGN_ANALYTICS_URL, {
      method: 'POST',
      headers: authHeaders(jwt),
      body: JSON.stringify({ campaign_ids: campaignIds }),
    })
    const text = await res.text()

    if (!res.ok) {
      throw new Error(
        `Campaign analytics request failed (${res.status} ${res.statusText}) on batch ${i + 1}/${batches.length}. Response: ${preview(text)}`,
      )
    }

    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(
        `Campaign analytics returned non-JSON on batch ${i + 1}. Response: ${preview(text)}`,
      )
    }

    const results = extractArray(json, ['results'])
    if (!results) {
      throw new Error(
        `Campaign analytics response is missing the "results" array on batch ${i + 1}. Raw response: ${preview(json)}`,
      )
    }

    for (const r of results) {
      const item = r as RawCampaignAnalytics
      const id = num(item?.id, 0)
      if (id) merged.set(id, item)
    }

    if (i < batches.length - 1) await delay(REQUEST_DELAY_MS)
  }

  return Array.from(merged.values())
}

// ---------------------------------------------------------------------------
// Orchestrator: list -> analytics -> joined campaigns
// ---------------------------------------------------------------------------

/**
 * Load real campaigns end-to-end.
 * @param manualIds optional user-supplied IDs that override the list endpoint.
 */
export async function loadCampaigns(
  jwt: string,
  manualIds?: number[],
): Promise<LoadCampaignsResult> {
  const warnings: string[] = []

  // 1) Resolve names/status from the campaign list (best-effort).
  const nameMap = new Map<number, { name: string; status: string }>()
  let listIds: number[] = []
  try {
    const list = await fetchCampaignList(jwt)
    for (const item of list) {
      const id = num(item.id, 0)
      if (!id) continue
      listIds.push(id)
      if (item.name) {
        nameMap.set(id, { name: item.name, status: item.status ?? '' })
      }
    }
    if (list.length === 0) {
      warnings.push(
        'Campaign list endpoint returned no campaigns. Campaign names may be missing.',
      )
    }
  } catch (e) {
    warnings.push(
      `Could not fetch campaign names: ${e instanceof Error ? e.message : String(e)}. Showing campaign IDs only.`,
    )
  }

  // 2) Decide which IDs to fetch analytics for.
  const ids =
    manualIds && manualIds.length > 0
      ? manualIds
      : Array.from(new Set(listIds))

  if (ids.length === 0) {
    throw new Error(
      'No campaign IDs available. The campaign list endpoint returned nothing — paste campaign IDs manually to continue.',
    )
  }

  // 3) Analytics (chunked) + join with names.
  const analytics = await fetchCampaignAnalytics(jwt, ids)
  if (analytics.length === 0) {
    throw new Error('Campaign analytics returned 0 results for the given IDs.')
  }

  const campaigns = analytics.map((raw) =>
    normalizeCampaign(raw, nameMap.get(num(raw?.id, 0))),
  )

  if (campaigns.some((c) => c.nameMissing)) {
    warnings.push(
      'Some campaign names could not be resolved — those rows show "Campaign <id>".',
    )
  }

  return { campaigns, warnings }
}
