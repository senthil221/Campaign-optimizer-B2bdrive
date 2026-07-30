import type {
  Campaign,
  CampaignGeneralSettings,
  CampaignListEntry,
  CampaignOverview,
  CampaignSequencePayload,
  EditableSequence,
  EditableVariant,
  EmailAccount,
  InboxReply,
  LoadCampaignsResult,
  RawCampaignAnalytics,
  RawCampaignOverview,
  RawEmailAccount,
  RawSeqVariant,
  RawSequenceStep,
  SequenceEditRequest,
  SequenceStat,
  TagSendPerformance,
} from '../types'
import { num } from '../utils/campaignCalculations'

// Same-origin serverless proxy (see /api/*). The proxy injects the Smartlead
// JWT from a server-side env var, so no secret is exposed in the browser and
// there is no cross-origin (CORS) call from the client.
const EMAIL_ACCOUNTS_URL = '/api/email-accounts'
const CAMPAIGN_LIST_URL = '/api/campaign-list'
const CAMPAIGN_ANALYTICS_URL = '/api/campaign-analytics'
const CAMPAIGN_OVERVIEW_URL = '/api/campaign-overview'
const CAMPAIGN_SCHEDULE_URL = '/api/campaign-schedule'
const CAMPAIGN_GENERAL_SETTINGS_URL = '/api/campaign-general-settings'
const CAMPAIGN_SEQUENCES_URL = '/api/campaign-sequences'
const CAMPAIGN_SEQUENCE_EDITOR_URL = '/api/campaign-sequence-editor'
const CAMPAIGN_STATUS_URL = '/api/campaign-status'
const CAMPAIGN_INBOX_URL = '/api/campaign-inbox'
const PROVIDER_PERFORMANCE_URL = '/api/provider-performance'

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
    generalSettings: null, // filled in by fetchCampaignGeneralSettings()
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
    overview: null, // filled in by fetchCampaignOverviews()
  }
}

/** Pull the deletion-proof counters out of an analytics/overview payload. */
export function normalizeOverview(raw: RawCampaignOverview): CampaignOverview {
  const leads = raw?.leads ?? {}
  const progress = raw?.progress ?? {}
  return {
    uniqueSent: num(leads?.unique_sent_count, 0),
    inProgress: num(progress?.leads_in_progress, 0),
    toBeStarted: num(progress?.leads_to_be_started, 0),
    totalLeads: num(
      progress?.total_leads ?? leads?.total_leads_count,
      0,
    ),
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

/**
 * Smartlead returns one tag row per email provider. Sum duplicate tags so the
 * overview exposes a single live count for each sending pool.
 */
export async function fetchTagSendPerformance(
  jwt: string,
  date: string,
): Promise<TagSendPerformance[]> {
  const res = await fetch(
    `${PROVIDER_PERFORMANCE_URL}?date=${encodeURIComponent(date)}`,
    { method: 'GET', headers: authHeaders(jwt) },
  )
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Live tag sends request failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Live tag sends response was not valid JSON: ${preview(text)}`)
  }

  const root = json as {
    data?: {
      email_providers_performance_overview?: {
        tag_wise?: Array<Record<string, unknown>>
      }
    }
  }
  const rows = root?.data?.email_providers_performance_overview?.tag_wise ?? []
  const aggregated = new Map<string, TagSendPerformance>()

  for (const row of rows) {
    const tagId = num(row.tag_id, 0) || null
    const tagName = String(row.tag_name ?? '').trim()
    if (!tagId && !tagName) continue
    const key = tagId ? `id:${tagId}` : `name:${tagName.toLowerCase()}`
    const current = aggregated.get(key)
    if (current) current.sent += num(row.sent, 0)
    else aggregated.set(key, { tagId, tagName, sent: num(row.sent, 0) })
  }

  return Array.from(aggregated.values())
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
// Campaign overview (per-campaign, deletion-proof progress counters)
// ---------------------------------------------------------------------------

/** GET one campaign's analytics overview. Returns null on any non-fatal miss. */
export async function fetchCampaignOverview(
  jwt: string,
  id: number,
): Promise<CampaignOverview | null> {
  const res = await fetch(`${CAMPAIGN_OVERVIEW_URL}?id=${id}`, {
    method: 'GET',
    headers: authHeaders(jwt),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Overview request failed (${res.status} ${res.statusText}) for campaign ${id}. Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `Overview response was not JSON for campaign ${id}. Response: ${preview(text)}`,
    )
  }
  const data = (json as Record<string, unknown>)?.data
  if (!data || typeof data !== 'object') return null
  return normalizeOverview(data as RawCampaignOverview)
}

/**
 * Fetch overviews for many campaigns with bounded concurrency. The endpoint is
 * per-campaign (no batch form), so this runs a small pool of workers rather
 * than firing every request at once. Individual failures are swallowed — a
 * missing overview just falls back to the live lead-stats progress.
 */
export async function fetchCampaignOverviews(
  jwt: string,
  ids: number[],
  concurrency = 6,
): Promise<Map<number, CampaignOverview>> {
  const out = new Map<number, CampaignOverview>()
  if (ids.length === 0) return out

  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const id = ids[cursor++]
      try {
        const ov = await fetchCampaignOverview(jwt, id)
        if (ov) out.set(id, ov)
      } catch {
        // best-effort: leave this campaign without an overview
      }
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, ids.length) }, worker)
  await Promise.all(pool)
  return out
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
// General settings (plain text + open/click tracking) — Smartlead GraphQL
// ---------------------------------------------------------------------------

/**
 * track_settings holds Smartlead's disable-flags as an array of strings (the
 * exact enum spelling isn't documented publicly), so this matches tolerantly:
 * any entry mentioning the feature alongside a "don't/disable" word counts.
 */
function trackFlagSet(trackSettings: unknown[], keyword: string): boolean {
  return trackSettings.some((s) => {
    const up = String(s).toUpperCase()
    return (
      up.includes(keyword) &&
      (up.includes('DONT') || up.includes("DON'T") || up.includes('DISABLE') || up.includes('NO_'))
    )
  })
}

function normalizeGeneralSettings(raw: Record<string, unknown>): CampaignGeneralSettings {
  const trackSettings = Array.isArray(raw?.track_settings) ? raw.track_settings : []
  return {
    sendAsPlainText: raw?.send_as_plain_text === true,
    forcePlainText: raw?.force_plain_text === true,
    dontTrackOpens: trackFlagSet(trackSettings, 'OPEN'),
    dontTrackClicks: trackFlagSet(trackSettings, 'CLICK'),
  }
}

/** id -> plain-text/tracking settings for the given campaign ids (one batched read). */
export async function fetchCampaignGeneralSettings(
  jwt: string,
  ids: number[],
): Promise<Map<number, CampaignGeneralSettings>> {
  const out = new Map<number, CampaignGeneralSettings>()
  if (ids.length === 0) return out

  for (const batch of chunk(ids, 200)) {
    const res = await fetch(`${CAMPAIGN_GENERAL_SETTINGS_URL}?ids=${batch.join(',')}`, {
      method: 'GET',
      headers: authHeaders(jwt),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(
        `General settings request failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
      )
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`General settings response was not JSON. Response: ${preview(text)}`)
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
      if (id) out.set(id, normalizeGeneralSettings(o))
    }
  }
  return out
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
    const mapping = (o.email_campaign_seq_mapping ?? {}) as Record<string, unknown>
    return {
      id: num(o.id, 0),
      seqNumber: num(o.seq_number, 0),
      variantLabel: label != null && String(label).trim() ? String(label) : null,
      emailCampaignSeqId: num(mapping.id, 0),
      seqVariantId: num(o.seq_variant_id, 0),
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
// Sequence editor (live campaign sequences: enable/disable + edit copy)
// ---------------------------------------------------------------------------

/** Pull the sequences array out of whichever envelope Smartlead/the proxy returns. */
function extractSequenceSteps(json: unknown): RawSequenceStep[] | null {
  if (Array.isArray(json)) return json as RawSequenceStep[]
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.sequences)) return obj.sequences as RawSequenceStep[]
  const data = obj.data
  if (Array.isArray(data)) return data as RawSequenceStep[]
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.sequences)) return d.sequences as RawSequenceStep[]
  }
  return null
}

function normalizeVariant(raw: RawSeqVariant): EditableVariant {
  const label = raw?.variantLabel
  return {
    id: num(raw?.id, 0),
    variantLabel: label != null && String(label).trim() ? String(label) : null,
    subject: raw?.subject != null ? String(raw.subject) : '',
    emailBody: raw?.emailBody != null ? String(raw.emailBody) : '',
    isDeleted: raw?.isDeleted === true,
  }
}

function normalizeSequenceStep(raw: RawSequenceStep, index: number): EditableSequence {
  const variants = Array.isArray(raw?.seqVariants)
    ? raw.seqVariants.map(normalizeVariant).filter((v) => v.id > 0)
    : []
  return {
    id: num(raw?.id, 0),
    seqNumber: num(raw?.seqNumber, index + 1),
    seqType: raw?.seqType != null ? String(raw.seqType) : 'EMAIL',
    delayInDays: num(raw?.seqDelayDetails?.delayInDays, 0),
    variants,
  }
}

/** Normalize a raw sequences payload into the editable model. */
export function normalizeSequencePayload(
  campaignId: number,
  json: unknown,
): CampaignSequencePayload {
  const steps = extractSequenceSteps(json) ?? []
  const sequences = steps
    .map((s, i) => normalizeSequenceStep(s, i))
    .filter((s) => s.id > 0)
    .sort((a, b) => a.seqNumber - b.seqNumber)
  return { campaignId, sequences }
}

/** Load the editable sequence payload for a campaign (subject/body/variants/delay). */
export async function fetchSequenceEditor(
  jwt: string,
  campaignId: number,
): Promise<CampaignSequencePayload> {
  const res = await fetch(`${CAMPAIGN_SEQUENCE_EDITOR_URL}?id=${campaignId}`, {
    method: 'GET',
    headers: authHeaders(jwt),
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = preview(text)
    try {
      const j = JSON.parse(text) as Record<string, unknown>
      if (j?.error) msg = String(j.error)
    } catch {
      /* keep raw preview */
    }
    throw new Error(`Sequence load failed (${res.status} ${res.statusText}). ${msg}`)
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Sequence response was not JSON. Response: ${preview(text)}`)
  }
  return normalizeSequencePayload(campaignId, json)
}

/**
 * Save one change (toggle / subject / body / delay) to a single sequence or
 * variant. The proxy re-reads the latest payload, mutates only the target by
 * ID, submits the whole payload to Smartlead, then refetches to verify. The
 * fresh, verified payload is returned so the caller can reconcile its UI.
 */
export async function saveSequenceEdit(
  jwt: string,
  req: SequenceEditRequest,
): Promise<CampaignSequencePayload> {
  const res = await fetch(CAMPAIGN_SEQUENCE_EDITOR_URL, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify(req),
  })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Save response was not JSON. Response: ${preview(text)}`)
  }
  const obj = (json ?? {}) as Record<string, unknown>
  if (!res.ok || obj?.error) {
    throw new Error(
      obj?.error
        ? String(obj.error)
        : `Save failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }
  // The proxy returns { ok, payload } where payload is the refetched raw payload.
  return normalizeSequencePayload(req.campaignId, obj.payload ?? null)
}

// ---------------------------------------------------------------------------
// Campaign inbox (replied leads, lazy — on clicking a Replied count)
// ---------------------------------------------------------------------------

/** Collapse email HTML to readable plain text (entities + tags stripped). */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function normalizeInboxReply(raw: Record<string, unknown>): InboxReply {
  const rmd = (raw?.reply_message_details ?? {}) as Record<string, unknown>
  const ed = (raw?.email_details ?? {}) as Record<string, unknown>

  const first = String(ed?.firstName ?? '').trim()
  const last = String(ed?.lastName ?? '').trim()
  const leadName = [first, last].filter(Boolean).join(' ')

  // Prefer Smartlead's cleaned "visibleText" (just the new reply); fall back to
  // the raw text, then to the HTML rendition collapsed to text.
  const visible = String(rmd?.visibleText ?? '').trim()
  const rawText = String(rmd?.text ?? '').trim()
  const htmlText = rmd?.textAsHtml ? htmlToText(String(rmd.textAsHtml)) : ''
  const replyText = rawText || htmlText
  const replySnippet = visible || replyText

  const subject =
    (rmd?.subject != null && String(rmd.subject).trim()) ||
    (raw?.custom_subject != null && String(raw.custom_subject).trim()) ||
    ''

  const sentBody = raw?.custom_email_message
    ? htmlToText(String(raw.custom_email_message))
    : ''

  return {
    id: String(raw?.id ?? ''),
    leadName,
    leadEmail: String(ed?.email ?? '').trim(),
    fromEmail: String(ed?.from ?? '').trim(),
    seqNumber: num(ed?.emailSeqNumber, 0),
    sentTime: raw?.sent_time ? String(raw.sent_time) : null,
    replyTime: raw?.reply_time ? String(raw.reply_time) : null,
    subject,
    replySnippet,
    replyText,
    replyHtml: rmd?.textAsHtml ? String(rmd.textAsHtml) : '',
    sentBody,
    sentHtml: raw?.custom_email_message ? String(raw.custom_email_message) : '',
    isBounced: raw?.is_bounced === true,
    isOpened: raw?.is_opened === true,
    isClicked: raw?.is_clicked === true,
  }
}

export interface InboxQuery {
  campaignId: number
  offset?: number
  limit?: number
  /** Restrict to one sequence step (email_campaign_seq_id). */
  seqId?: number
  /** Restrict to one A/B variant (seq_variant_id). */
  variantId?: number
}

/**
 * Fetch one page of replied leads for a campaign (optionally scoped to a single
 * sequence variant). Ordered newest reply first, matching Smartlead's Inbox.
 */
export async function fetchCampaignInbox(
  jwt: string,
  query: InboxQuery,
): Promise<InboxReply[]> {
  const res = await fetch(CAMPAIGN_INBOX_URL, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      campaignId: query.campaignId,
      offset: query.offset ?? 0,
      limit: query.limit ?? 20,
      seqId: query.seqId,
      variantId: query.variantId,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Inbox request failed (${res.status} ${res.statusText}). Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Inbox response was not JSON. Response: ${preview(text)}`)
  }
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj?.errors) && obj.errors.length) {
    throw new Error(`Smartlead GraphQL error: ${preview(obj.errors)}`)
  }
  const rows = extractArray(json, ['email_campaign_stats'])
  if (!rows) return []
  return rows.map((r) => normalizeInboxReply((r ?? {}) as Record<string, unknown>))
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

  // 4-6) Three independent, best-effort enrichment reads. They each touch only
  //      `ids` and write a different campaign field (maxLeadsPerDay / overview /
  //      generalSettings), so they run concurrently — the slow per-campaign
  //      overview fetch now hides the two batched reads instead of blocking on
  //      them. Each collects its own warnings so ordering below stays stable.
  const scheduleStep = async (): Promise<string[]> => {
    try {
      const scheduleMap = await fetchCampaignSchedules(jwt, ids)
      for (const c of campaigns) {
        const v = scheduleMap.get(c.campaignId)
        if (v !== undefined) c.maxLeadsPerDay = v
      }
      return []
    } catch (e) {
      return [
        `Could not load max-leads/day from the schedule: ${e instanceof Error ? e.message : String(e)}`,
      ]
    }
  }

  // Deletion-proof progress counters. Without this, progress falls back to
  // completed/total, which collapses once completed leads are deleted.
  const overviewStep = async (): Promise<string[]> => {
    try {
      const overviewMap = await fetchCampaignOverviews(jwt, ids)
      for (const c of campaigns) {
        const ov = overviewMap.get(c.campaignId)
        if (ov) c.overview = ov
      }
      if (overviewMap.size === 0 && campaigns.length > 0) {
        return [
          'Could not load campaign overview counters — progress may understate campaigns whose completed leads were deleted.',
        ]
      }
      return []
    } catch (e) {
      return [
        `Could not load campaign overview counters: ${e instanceof Error ? e.message : String(e)}`,
      ]
    }
  }

  // Plain text / open & click tracking flags.
  const settingsStep = async (): Promise<string[]> => {
    try {
      const settingsMap = await fetchCampaignGeneralSettings(jwt, ids)
      for (const c of campaigns) {
        const s = settingsMap.get(c.campaignId)
        if (s) c.generalSettings = s
      }
      return []
    } catch (e) {
      return [
        `Could not load campaign general settings: ${e instanceof Error ? e.message : String(e)}`,
      ]
    }
  }

  const [scheduleWarns, overviewWarns, settingsWarns] = await Promise.all([
    scheduleStep(),
    overviewStep(),
    settingsStep(),
  ])
  warnings.push(...scheduleWarns, ...overviewWarns, ...settingsWarns)

  return { campaigns, warnings, taggedCount, rawSample }
}
