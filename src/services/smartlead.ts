import type {
  Campaign,
  CampaignListEntry,
  EmailAccount,
  LoadCampaignsResult,
  RawCampaignAnalytics,
  RawEmailAccount,
  SequenceStat,
} from '../types'
import { num } from '../utils/campaignCalculations'

// Same-origin serverless proxy (see /api/*). The proxy injects the Smartlead
// JWT from a server-side env var, so no secret is exposed in the browser and
// there is no cross-origin (CORS) call from the client.
const EMAIL_ACCOUNTS_URL = '/api/email-accounts'
const CAMPAIGN_LIST_URL = '/api/campaign-list'
const CAMPAIGN_ANALYTICS_URL = '/api/campaign-analytics'
const CAMPAIGN_SCHEDULE_URL = '/api/campaign-schedule'
const CAMPAIGN_SEQUENCES_URL = '/api/campaign-sequences'
const CAMPAIGN_STATUS_URL = '/api/campaign-status'

const PAGE_LIMIT = 100
const ANALYTICS_CHUNK = 50
const REQUEST_DELAY_MS = 300
const MAX_PAGES = 200 // safety cap (20k accounts)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Optional JWT / API key overrides → forwarded to the proxy as headers. When
// empty, the proxy falls back to its server-side SMARTLEAD_JWT / SMARTLEAD_API_KEY.
function authHeaders(jwt: string, apiKey = ''): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['x-smartlead-jwt'] = jwt
  if (apiKey) headers['x-smartlead-api-key'] = apiKey
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

export function normalizeEmailAccount(
  raw: RawEmailAccount,
  isInUseFallback = true,
): EmailAccount {
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

  // Treat an account as disconnected only when Smartlead explicitly reports a
  // failed SMTP/IMAP handshake. Absent fields are assumed connected.
  const connected = raw?.is_smtp_success !== false && raw?.is_imap_success !== false

  // Trust the account's own is_in_use flag (assigned to a campaign = in use,
  // otherwise idle). The fetch-bucket value is only a fallback for when the
  // endpoint omits the field — so dedupe order can't misclassify an inbox.
  const isInUse =
    typeof raw?.is_in_use === 'boolean' ? raw.is_in_use : isInUseFallback

  return {
    id: num(raw?.id, 0),
    fromEmail: String(raw?.from_email ?? ''),
    messagePerDay: num(raw?.message_per_day, 0),
    dailySentCount: num(raw?.daily_sent_count, 0),
    warmupStatus: String(warmup?.status ?? 'UNKNOWN'),
    warmupReputation: num(warmup?.warmup_reputation, 0),
    connected,
    isInUse,
    tagIds,
    tagNames,
  }
}

/**
 * Pull tag names off a raw campaign-list row, tolerating the shapes Smartlead
 * may use: arrays of strings, {name}, {tag_name}, {label}, or {tag:{name}},
 * under any of several likely field names.
 */
export function extractTagNames(o: Record<string, unknown>): string[] {
  const out: string[] = []

  const pushOne = (v: unknown) => {
    if (!v) return
    if (typeof v === 'string') {
      if (v.trim()) out.push(v.trim())
      return
    }
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const nested =
        (typeof obj.name === 'string' && obj.name) ||
        (typeof obj.tag_name === 'string' && obj.tag_name) ||
        (typeof obj.label === 'string' && obj.label) ||
        (typeof obj.title === 'string' && obj.title) ||
        (obj.tag &&
          typeof (obj.tag as Record<string, unknown>).name === 'string' &&
          ((obj.tag as Record<string, unknown>).name as string)) ||
        ''
      if (nested) out.push(String(nested).trim())
    }
  }

  const CANDIDATE_KEYS = [
    'campaign_tags_mappings', // Smartlead get-all-campaigns → [{ tag: { name } }]
    'tags',
    'campaign_tags',
    'campaignTags',
    'labels',
    'tag',
    'client_tags',
    'campaign_label',
  ]
  for (const key of CANDIDATE_KEYS) {
    const val = o[key]
    if (Array.isArray(val)) val.forEach(pushOne)
    else if (val) pushOne(val)
  }

  return Array.from(new Set(out.filter(Boolean)))
}

export function normalizeCampaign(
  raw: RawCampaignAnalytics,
  nameInfo: { name: string; status: string; tags: string[] } | undefined,
): Campaign {
  const stats = raw?.campaign_lead_stats ?? {}
  const id = num(raw?.id, 0)
  return {
    campaignId: id,
    campaignName: nameInfo?.name || `Campaign ${id}`,
    nameMissing: !nameInfo?.name,
    apiTags: nameInfo?.tags ?? [],
    sentCount: num(raw?.sent_count, 0),
    replyCount: num(raw?.reply_count, 0),
    oooReplyCount: num(raw?.ooo_reply_count, 0),
    bounceCount: num(raw?.bounce_count, 0),
    totalCount: num(raw?.total_count, 0),
    draftedCount: num(raw?.drafted_count, 0),
    status: String(nameInfo?.status ?? raw?.status ?? ''),
    maxLeadsPerDay: null, // filled in by fetchCampaignSchedules()
    leadStats: {
      total: num(stats?.total, 0),
      completed: num(stats?.completed, 0),
      inprogress: num(stats?.inprogress, 0),
      interested: num(stats?.interested, 0),
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
 * Paginate one isInUse bucket. The flag is set explicitly on each account so
 * we know for certain whether it's active (in a campaign) or idle.
 */
async function fetchEmailAccountsByUsage(
  jwt: string,
  inUse: boolean,
): Promise<EmailAccount[]> {
  const all: EmailAccount[] = []
  const label = inUse ? 'active' : 'idle'

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT
    const url = `${EMAIL_ACCOUNTS_URL}?offset=${offset}&isInUse=${inUse}`

    const res = await fetch(url, { method: 'GET', headers: authHeaders(jwt) })
    const text = await res.text()

    if (!res.ok) {
      throw new Error(
        `Email accounts (${label}) request failed (${res.status} ${res.statusText}) at offset ${offset}. Response: ${preview(text)}`,
      )
    }

    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(
        `Email accounts (${label}) response was not valid JSON at offset ${offset}. Response: ${preview(text)}`,
      )
    }

    const rows = extractArray(json, ['email_accounts'])
    if (!rows || rows.length === 0) break

    // TEMP DIAGNOSTIC: dump the first raw account so we can see whether the
    // endpoint actually returns is_in_use / daily_sent_count, and what the
    // isInUse param does. Remove once idle/used-today are confirmed.
    if (page === 0) {
      const sample = rows[0] as Record<string, unknown>
      console.log(`[email-accounts ${label}] first raw row:`, sample)
      console.log(`[email-accounts ${label}] keys:`, Object.keys(sample ?? {}))
      const inUseVals = rows.map((r) => (r as RawEmailAccount)?.is_in_use)
      console.log(`[email-accounts ${label}] is_in_use distribution (page 1):`, {
        true: inUseVals.filter((v) => v === true).length,
        false: inUseVals.filter((v) => v === false).length,
        undefined: inUseVals.filter((v) => v == null).length,
      })
    }

    for (const row of rows) {
      all.push(normalizeEmailAccount(row as RawEmailAccount, inUse))
    }

    if (rows.length < PAGE_LIMIT) break
    await delay(REQUEST_DELAY_MS)
  }

  return all
}

/**
 * Fetch ALL email accounts (active + idle) in parallel, tagging each with
 * isInUse so idle inboxes can be surfaced in the Tag Overview.
 */
export async function fetchEmailAccounts(jwt: string): Promise<EmailAccount[]> {
  const [active, idle] = await Promise.all([
    fetchEmailAccountsByUsage(jwt, true),
    fetchEmailAccountsByUsage(jwt, false),
  ])
  return dedupeAccounts([...active, ...idle])
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
  apiKey = '',
): Promise<{ entries: CampaignListEntry[]; rawSample: unknown }> {
  const byId = new Map<number, CampaignListEntry>()
  let rawSample: unknown = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT
    const res = await fetch(`${CAMPAIGN_LIST_URL}?offset=${offset}`, {
      method: 'GET',
      headers: authHeaders(jwt, apiKey),
    })
    const text = await res.text()

    if (!res.ok) {
      throw new Error(
        `Campaign list request failed (${res.status} ${res.statusText}) at offset ${offset}. Response: ${preview(text)}`,
      )
    }

    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(
        `Campaign list response was not valid JSON at offset ${offset}. Response: ${preview(text)}`,
      )
    }

    const rows = extractArray(json, ['campaigns', 'email_campaigns', 'results'])
    if (!rows || rows.length === 0) break

    if (rawSample === null) rawSample = rows[0]

    let added = 0
    for (const r of rows) {
      const o = (r ?? {}) as Record<string, unknown>
      const id = num(o.id, 0)
      if (!id || byId.has(id)) continue
      byId.set(id, {
        id,
        name: o.name != null ? String(o.name) : null,
        status: o.status != null ? String(o.status) : null,
        tags: extractTagNames(o),
      })
      added++
    }

    // Stop on a short page, or if the endpoint ignored offset (no new rows).
    if (rows.length < PAGE_LIMIT || added === 0) break
    await delay(REQUEST_DELAY_MS)
  }

  return { entries: Array.from(byId.values()), rawSample }
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
      body: JSON.stringify({ args: { campaign_ids: campaignIds } }),
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
// Schedule cap (max new leads / day) — Smartlead GraphQL via the proxy
// ---------------------------------------------------------------------------

/** id -> max_leads_per_day for the given campaign ids (one batched read). */
export async function fetchCampaignSchedules(
  jwt: string,
  ids: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (ids.length === 0) return out

  for (const batch of chunk(ids, 200)) {
    const res = await fetch(`${CAMPAIGN_SCHEDULE_URL}?ids=${batch.join(',')}`, {
      method: 'GET',
      headers: authHeaders(jwt),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(
        `Schedule request failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
      )
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`Schedule response was not JSON. Response: ${preview(text)}`)
    }
    const obj = json as Record<string, unknown>
    if (Array.isArray(obj?.errors) && obj.errors.length) {
      throw new Error(`Smartlead GraphQL error: ${preview(obj.errors)}`)
    }
    const rows = extractArray(json, ['email_campaigns'])
    if (!rows) continue
    for (const r of rows) {
      const o = (r ?? {}) as Record<string, unknown>
      const id = num(o.id, 0)
      if (id) out.set(id, num(o.max_leads_per_day, 0))
    }
  }
  return out
}

/** Update only max_leads_per_day for one campaign (Hasura partial _set). */
export async function updateMaxLeadsPerDay(
  jwt: string,
  id: number,
  value: number,
): Promise<void> {
  const res = await fetch(CAMPAIGN_SCHEDULE_URL, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({ id, maxLeadsPerDay: value }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Update failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Update response was not JSON. Response: ${preview(text)}`)
  }
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj?.errors) && obj.errors.length) {
    throw new Error(`Smartlead rejected the update: ${preview(obj.errors)}`)
  }
}

// ---------------------------------------------------------------------------
// Campaign status (pause / resume / stop)
// ---------------------------------------------------------------------------

/** Smartlead status values the API accepts. START resumes a paused campaign. */
export type CampaignStatusAction = 'START' | 'PAUSED' | 'STOPPED'

/** Pause, resume (START), or stop a single campaign. */
export async function updateCampaignStatus(
  jwt: string,
  apiKey: string,
  id: number,
  status: CampaignStatusAction,
): Promise<void> {
  const res = await fetch(CAMPAIGN_STATUS_URL, {
    method: 'POST',
    headers: authHeaders(jwt, apiKey),
    body: JSON.stringify({ id, status }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Status update failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Status response was not JSON. Response: ${preview(text)}`)
  }
  const obj = json as Record<string, unknown>
  // Smartlead returns { ok: true } / { message: "..." }; treat an explicit
  // error field (or GraphQL-style errors array) as a failure.
  if (obj?.error || (Array.isArray(obj?.errors) && obj.errors.length)) {
    throw new Error(`Smartlead rejected the status change: ${preview(json)}`)
  }
}

// ---------------------------------------------------------------------------
// Per-campaign sequence / variant analytics (lazy, on row expand)
// ---------------------------------------------------------------------------

export async function fetchCampaignSequences(
  jwt: string,
  campaignId: number,
): Promise<SequenceStat[]> {
  const res = await fetch(`${CAMPAIGN_SEQUENCES_URL}?id=${campaignId}`, {
    method: 'GET',
    headers: authHeaders(jwt),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Sequence request failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Sequence response was not JSON. Response: ${preview(text)}`)
  }
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj?.errors) && obj.errors.length) {
    throw new Error(`Smartlead GraphQL error: ${preview(obj.errors)}`)
  }
  const rows = extractArray(json, ['grouped_email_campaign_stats'])
  if (!rows) return []

  return rows.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    const label = o.variant_label
    return {
      id: num(o.id, 0),
      seqNumber: num(o.seq_number, 0),
      variantLabel: label != null && String(label).trim() ? String(label) : null,
      sent: num(o.sent_count, 0),
      replied: num(o.reply_count, 0),
      positiveReplies: num(o.positive_reply_count, 0),
      bounced: num(o.bounce_count, 0),
      senderBounced: num(o.sender_bounce_count, 0),
      opened: num(o.open_count, 0),
      clicked: num(o.click_count, 0),
    }
  })
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
  apiKey: string,
  manualIds?: number[],
): Promise<LoadCampaignsResult> {
  const warnings: string[] = []

  // 1) Resolve names/status/tags from the campaign list (best-effort).
  const nameMap = new Map<
    number,
    { name: string; status: string; tags: string[] }
  >()
  const listIds: number[] = []
  let rawSample: unknown = null
  try {
    const { entries, rawSample: sample } = await fetchCampaignList(jwt, apiKey)
    rawSample = sample
    for (const item of entries) {
      const id = num(item.id, 0)
      if (!id) continue
      listIds.push(id)
      nameMap.set(id, {
        name: item.name ?? '',
        status: item.status ?? '',
        tags: item.tags,
      })
    }
    if (entries.length === 0) {
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

  const taggedCount = campaigns.filter((c) => c.apiTags.length > 0).length
  if (taggedCount === 0) {
    warnings.push(
      'No campaign tags were found in the campaign-list response. Auto-mapping is off — map tags manually, and check the debug drawer to find the tag field name.',
    )
  }

  // 4) Schedule caps (max new leads / day) — best-effort, never fatal.
  try {
    const scheduleMap = await fetchCampaignSchedules(jwt, ids)
    for (const c of campaigns) {
      const v = scheduleMap.get(c.campaignId)
      if (v !== undefined) c.maxLeadsPerDay = v
    }
  } catch (e) {
    warnings.push(
      `Could not load max-leads/day from the schedule: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  return { campaigns, warnings, taggedCount, rawSample }
}
