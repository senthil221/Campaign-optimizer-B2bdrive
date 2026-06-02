import type {
  Campaign,
  EmailAccount,
  RawCampaign,
  RawEmailAccount,
} from '../types'
import { num } from '../utils/calculations'

const EMAIL_ACCOUNTS_URL =
  'https://server.smartlead.ai/api/email-account/get-total-email-accounts'
const CAMPAIGN_ANALYTICS_URL =
  'https://server.smartlead.ai/api/email-campaigns/get-campaign-analytics'

const PAGE_LIMIT = 100
const REQUEST_DELAY_MS = 350
const MAX_PAGES = 100 // hard safety cap (10k accounts)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Smartlead responses come back in a few shapes depending on endpoint/version.
 * Dig the array out of whichever envelope is present, never throwing.
 */
function extractArray(json: unknown, keys: string[]): unknown[] {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return []

  const obj = json as Record<string, unknown>

  // direct keys at top level: json.email_accounts, json.campaigns, json.data
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }

  // nested under data: json.data.email_accounts, json.data (array)
  const data = obj.data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of keys) {
      if (Array.isArray(d[key])) return d[key] as unknown[]
    }
  }

  return []
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

export function normalizeCampaign(raw: RawCampaign): Campaign {
  const stats = raw?.campaign_lead_stats ?? {}
  return {
    campaignId: num(raw?.campaign_id ?? raw?.id, 0),
    campaignName: String(raw?.campaign_name ?? raw?.name ?? 'Untitled campaign'),
    sentCount: num(raw?.sent_count, 0),
    replyCount: num(raw?.reply_count, 0),
    oooReplyCount: num(raw?.ooo_reply_count, 0),
    bounceCount: num(raw?.bounce_count, 0),
    totalCount: num(raw?.total_count, 0),
    status: String(raw?.status ?? 'ACTIVE'),
    leadStats: {
      total: num(stats?.total, 0),
      completed: num(stats?.completed, 0),
      inprogress: num(stats?.inprogress, 0),
      notStarted: num(stats?.notStarted, 0),
      paused: num(stats?.paused, 0),
      blocked: num(stats?.blocked, 0),
      stopped: num(stats?.stopped, 0),
    },
  }
}

function dedupeAccounts(accounts: EmailAccount[]): EmailAccount[] {
  const seen = new Map<number, EmailAccount>()
  for (const acc of accounts) {
    if (!seen.has(acc.id)) seen.set(acc.id, acc)
  }
  return Array.from(seen.values())
}

// ---------------------------------------------------------------------------
// Live fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch ALL in-use email accounts, paginating with offset += 100.
 * Stops when a page returns no accounts (or the safety cap is reached).
 */
export async function fetchEmailAccounts(jwt: string): Promise<EmailAccount[]> {
  if (!jwt) throw new Error('A JWT is required to fetch email accounts.')

  const all: EmailAccount[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT
    const url = `${EMAIL_ACCOUNTS_URL}?offset=${offset}&limit=${PAGE_LIMIT}&isInUse=true`

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(
        `Email accounts request failed (${res.status} ${res.statusText}) at offset ${offset}.`,
      )
    }

    const json = await res.json().catch(() => null)
    const rows = extractArray(json, ['email_accounts'])
    if (rows.length === 0) break

    for (const row of rows) {
      all.push(normalizeEmailAccount(row as RawEmailAccount))
    }

    // last (partial) page → done
    if (rows.length < PAGE_LIMIT) break

    await delay(REQUEST_DELAY_MS)
  }

  return dedupeAccounts(all)
}

/**
 * Fetch campaign analytics. Supports JWT (Bearer) and/or API key.
 * The request body is intentionally permissive — Smartlead returns all
 * campaigns when no specific filter is provided.
 */
export async function fetchCampaigns(
  jwt: string,
  apiKey?: string,
): Promise<Campaign[]> {
  if (!jwt && !apiKey) {
    throw new Error('Provide a JWT or an API key to fetch campaigns.')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (jwt) headers.Authorization = `Bearer ${jwt}`

  let url = CAMPAIGN_ANALYTICS_URL
  if (apiKey) url += `?api_key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    throw new Error(
      `Campaign analytics request failed (${res.status} ${res.statusText}).`,
    )
  }

  const json = await res.json().catch(() => null)
  const rows = extractArray(json, ['campaigns', 'analytics', 'email_campaigns'])
  return rows.map((row) => normalizeCampaign(row as RawCampaign))
}

// ---------------------------------------------------------------------------
// Mock data — lets the app run with zero credentials
// ---------------------------------------------------------------------------

export function getMockAccounts(): EmailAccount[] {
  const tags: Record<string, { id: number; name: string }> = {
    saas: { id: 1, name: 'SaaS Outreach' },
    agency: { id: 2, name: 'Agency' },
    ecom: { id: 3, name: 'Ecommerce' },
  }

  const accounts: EmailAccount[] = []
  let id = 1000

  const make = (
    tag: { id: number; name: string },
    perDay: number,
    sent: number,
    rep: number,
  ): EmailAccount => ({
    id: id++,
    fromEmail: `sender${id}@${tag.name.toLowerCase().replace(/\s+/g, '')}.com`,
    messagePerDay: perDay,
    dailySentCount: sent,
    warmupStatus: 'ACTIVE',
    warmupReputation: rep,
    tagIds: [tag.id],
    tagNames: [tag.name],
  })

  // SaaS Outreach — 6 accounts
  for (let i = 0; i < 6; i++) accounts.push(make(tags.saas, 40, 30 + i, 95 - i))
  // Agency — 4 accounts
  for (let i = 0; i < 4; i++) accounts.push(make(tags.agency, 50, 20 + i, 90 - i))
  // Ecommerce — 3 accounts
  for (let i = 0; i < 3; i++) accounts.push(make(tags.ecom, 30, 25 + i, 88 - i))

  return accounts
}

export function getMockCampaigns(): Campaign[] {
  return [
    {
      campaignId: 5001,
      campaignName: 'SaaS Q3 Cold Outreach',
      sentCount: 4200,
      replyCount: 180,
      oooReplyCount: 22,
      bounceCount: 60,
      totalCount: 5000,
      status: 'ACTIVE',
      leadStats: {
        total: 5000,
        completed: 2100,
        inprogress: 400,
        notStarted: 2500,
        paused: 0,
        blocked: 0,
        stopped: 0,
      },
    },
    {
      campaignId: 5002,
      campaignName: 'SaaS Founders List',
      sentCount: 1800,
      replyCount: 95,
      oooReplyCount: 10,
      bounceCount: 25,
      totalCount: 2000,
      status: 'ACTIVE',
      leadStats: {
        total: 2000,
        completed: 1500,
        inprogress: 200,
        notStarted: 300,
        paused: 0,
        blocked: 0,
        stopped: 0,
      },
    },
    {
      campaignId: 5003,
      campaignName: 'Agency Lead Gen',
      sentCount: 3000,
      replyCount: 140,
      oooReplyCount: 15,
      bounceCount: 40,
      totalCount: 3500,
      status: 'ACTIVE',
      leadStats: {
        total: 3500,
        completed: 2900,
        inprogress: 150,
        notStarted: 450,
        paused: 0,
        blocked: 0,
        stopped: 0,
      },
    },
    {
      campaignId: 5004,
      campaignName: 'Ecommerce Holiday Push',
      sentCount: 900,
      replyCount: 30,
      oooReplyCount: 5,
      bounceCount: 12,
      totalCount: 1000,
      status: 'ACTIVE',
      leadStats: {
        total: 1000,
        completed: 1000,
        inprogress: 0,
        notStarted: 0,
        paused: 0,
        blocked: 0,
        stopped: 0,
      },
    },
    {
      campaignId: 5005,
      campaignName: 'Unmapped Test Campaign',
      sentCount: 200,
      replyCount: 8,
      oooReplyCount: 1,
      bounceCount: 3,
      totalCount: 1200,
      status: 'ACTIVE',
      leadStats: {
        total: 1200,
        completed: 300,
        inprogress: 100,
        notStarted: 800,
        paused: 0,
        blocked: 0,
        stopped: 0,
      },
    },
  ]
}

export function getMockTagMap(): Record<string, string> {
  return {
    '5001': 'SaaS Outreach',
    '5002': 'SaaS Outreach',
    '5003': 'Agency',
    '5004': 'Ecommerce',
    // 5005 intentionally left unmapped to demo the "no capacity" alert
  }
}
