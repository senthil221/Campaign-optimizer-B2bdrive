import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const MAX_RANGE_DAYS = 31
// Bounced leads per leads/filter page. Smartlead's own UI asks for 25; a larger
// page just means fewer round trips, and paging stops on an empty page rather
// than a short one, so a server-side cap cannot skip leads.
const BOUNCE_PAGE_LIMIT = 100
const MAX_BOUNCE_PAGES_PER_CAMPAIGN = 100
const MAX_BOUNCE_CAMPAIGNS_PER_REQUEST = 25
const BLACKLIST_CONCURRENCY = 8
const BLACKLIST_MAX_CAMPAIGNS = 500

type RiskCategory = 'tenant_threshold' | 'spam_rejected' | 'sender_550'

interface RiskMatch {
  category: RiskCategory
  label: string
}

interface RiskSample {
  senderEmail: string
  category: RiskCategory
  label: string
  occurredAt: string
  diagnostic: string
  senderBounce: boolean
}

interface DomainRiskAccumulator {
  domain: string
  total: number
  latestAt: string
  inboxes: Set<string>
  categories: Map<RiskCategory, { label: string; count: number }>
  samples: RiskSample[]
}

/** One bounced lead, reduced to what the two bounce analyses read. */
export interface BounceRecord {
  statsId: string
  seqId: number
  recipient: string
  senderEmail: string
  replyTime: string | null
  sentTime: string | null
  diagnostic: string
  senderBounce: boolean
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function stripHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function diagnosticText(value: unknown): string {
  const details = objectValue(value)
  return stripHtml(
    details.textAsHtml ?? details.text ?? details.visibleText ?? '',
  )
}

function isSenderBounce(value: unknown): boolean {
  const mappings = Array.isArray(value) ? value : value ? [value] : []
  return mappings.some((mapping) => {
    const row = objectValue(mapping)
    return Number(row.lead_category_id) === 9
  })
}

function classifyRisk(text: string): RiskMatch | null {
  const lower = text.toLowerCase()
  const tenantCodes = ['5.7.705', '5.7.700', '5.7.750', '5.7.233']
  if (
    tenantCodes.some((code) => lower.includes(code)) ||
    /\btenant\b.{0,100}\b(exceed(?:ed|s|ing)?|threshold|limit|blocked)\b/i.test(
      text,
    ) ||
    /\b(exceed(?:ed|s|ing)?|threshold)\b.{0,100}\btenant\b/i.test(text)
  ) {
    return {
      category: 'tenant_threshold',
      label: 'Tenant threshold exceeded',
    }
  }

  const spamRejected =
    lower.includes('5.7.350') ||
    /\b(detected|suspected|classified|rejected)\b.{0,80}\bspam\b/i.test(text) ||
    /\bspam\b.{0,80}\b(rejected|blocked|detected|policy)\b/i.test(text) ||
    /\b(low|poor)\s+(sender\s+|domain\s+|ip\s+)?reputation\b/i.test(text) ||
    /\b(spamhaus|blacklist|blocklist|banned sending|blocked using)\b/i.test(text)
  if (spamRejected) {
    return { category: 'spam_rejected', label: 'Spam / reputation rejected' }
  }

  const has550 = /\b550(?:\s|[-:])/i.test(text)
  const recipientFailure =
    /\b5\.1\.(?:0|1|3|10)\b/i.test(text) ||
    /\b(user unknown|recipient (?:not found|unknown)|no such user|invalid recipient|mailbox (?:unavailable|not found)|address rejected)\b/i.test(
      text,
    )
  const infrastructureSignal =
    /\b5\.7\.\d+\b/i.test(text) ||
    /\b(sender|sending ip|outbound|policy|reputation|authentication|dmarc|dkim|spf|blocked|blocklisted)\b/i.test(
      text,
    )
  if (has550 && !recipientFailure && infrastructureSignal) {
    return { category: 'sender_550', label: '550 sender rejection' }
  }

  return null
}

/**
 * Count only high-confidence, permanent recipient/list-quality failures.
 * Infrastructure, policy, reputation and authentication failures are rejected
 * before recipient wording is considered so they cannot inflate this count.
 */
function isListIssueBounce(text: string, senderBounce: boolean): boolean {
  if (senderBounce || !text.trim()) return false

  const infrastructureSignal =
    /\b5\.7\.\d+\b/i.test(text) ||
    /\b(sending ip|outbound|reputation|authentication|dmarc|dkim|spf|spamhaus|blacklist|blocklist|tenant threshold|rate limit)\b/i.test(
      text,
    ) ||
    /\bsender(?:'s)?\s+(?:email\s+)?(?:address|domain|ip|reputation|authentication)\b/i.test(
      text,
    ) ||
    /\b(?:sender|sending (?:ip|domain))\b.{0,40}\b(blocked|rejected|denied)\b/i.test(
      text,
    ) ||
    /\b(blocked|rejected)\b.{0,80}\b(policy|spam|reputation)\b/i.test(text)
  if (infrastructureSignal) return false

  // RFC 3463 address-status failures. 5.1.7 and 5.1.8 describe the sender,
  // so they are deliberately excluded from the recipient/list count.
  const permanentRecipientCode =
    /\b5\.1\.(?:0|1|2|3|4|6|10)\b/i.test(text)

  const invalidRecipient =
    /\b(user|recipient|addressee)\s+(?:is\s+)?unknown\b/i.test(text) ||
    /\bunknown\s+(?:user|recipient|addressee|to address)\b/i.test(text) ||
    /\b(?:recipient|email|mailbox)\s+(?:address\s+)?(?:was\s+)?not\s+found\b/i.test(text) ||
    /\bno\s+such\s+(?:user|recipient|mailbox|address)\b/i.test(text) ||
    /\b(?:invalid|bad|non[- ]?existent)\s+(?:recipient|mailbox|email(?: address)?|address)\b/i.test(text) ||
    /\b(?:recipient|mailbox|email(?: address)?|address)\s+(?:is\s+)?(?:invalid|non[- ]?existent)\b/i.test(text) ||
    /\b(?:account|address|mailbox)\s+(?:that you tried to reach\s+)?does not exist\b/i.test(
      text,
    ) ||
    /\b(?:recipient|mailbox|account)\s+(?:is\s+)?(?:disabled|deactivated|inactive)\b/i.test(
      text,
    ) ||
    /\bresolver\.adr\.(?:recip|recipient)notfound\b/i.test(text) ||
    /\baddress (?:may be )?misspelled or (?:may )?not exist\b/i.test(text)

  const invalidRecipientDomain =
    /\b(?:recipient\s+)?domain\s+(?:does not exist|not found|has no (?:valid )?mx)\b/i.test(
      text,
    ) ||
    /\bno\s+mx\s+records?\b/i.test(text) ||
    /\bnxdomain\b/i.test(text) ||
    /\bhost or domain name not found\b/i.test(text)

  return permanentRecipientCode || invalidRecipient || invalidRecipientDomain
}

function recipientEmail(value: unknown): string {
  const details = objectValue(value)
  return String(
    details.email ?? details.to ?? details.recipient ?? details.leadEmail ?? '',
  )
    .trim()
    .toLowerCase()
}

function dateBoundary(date: string, nextDay = false): Date {
  const boundary = new Date(`${date}T00:00:00+05:30`)
  if (nextDay) boundary.setUTCDate(boundary.getUTCDate() + 1)
  return boundary
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function preview(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** A bounced lead from leads/filter as a BounceRecord, or null if it has no id. */
export function bounceRecordFromLead(lead: unknown): BounceRecord | null {
  const row = objectValue(lead)
  const leadId = String(row.id ?? '').trim()
  if (!leadId) return null

  // After a bounce the lead is blocked, so its latest sent email is the one
  // that bounced; the bounce notice arrives as that email's "reply".
  const sent = objectValue(row.latest_email_stats)
  const reply = objectValue(row.latest_reply_stats)
  const details = objectValue(sent.email_details)

  return {
    statsId: String(sent.id ?? reply.id ?? `lead:${leadId}`),
    seqId: Number(sent.email_campaign_seq_id ?? reply.email_campaign_seq_id) || 0,
    recipient:
      recipientEmail(details) ||
      String(objectValue(row.email_lead).email ?? '').trim().toLowerCase(),
    senderEmail: String(
      details.from ?? objectValue(row.email_account).username ?? '',
    )
      .trim()
      .toLowerCase(),
    replyTime: optionalString(sent.reply_time ?? reply.reply_time),
    sentTime: optionalString(sent.sent_time ?? reply.sent_time),
    diagnostic: diagnosticText(
      sent.reply_message_details ?? reply.reply_message_details,
    ),
    // Lead category 9 is Smartlead's "sender originated bounce".
    senderBounce: Number(row.lead_category_id) === 9,
  }
}

/**
 * Every bounced lead in one campaign, via the filter Smartlead's own UI uses
 * for bounces, paged by its lastSeenLeadId cursor. Smartlead retired the
 * GraphQL host that let one query scan the whole account, so callers go
 * campaign by campaign.
 */
export async function scanCampaignBounces(
  jwt: string,
  campaignId: number,
): Promise<{ records: BounceRecord[]; truncated: boolean }> {
  const records: BounceRecord[] = []
  const seen = new Set<string>()
  let cursor: string | null = null

  for (let page = 0; page < MAX_BOUNCE_PAGES_PER_CAMPAIGN; page++) {
    const body: Record<string, unknown> = {
      limit: BOUNCE_PAGE_LIMIT,
      statusFilter: 'failed',
      leadStatuses: ['BLOCKED'],
      fieldSet: 'active_table',
    }
    if (cursor) body.lastSeenLeadId = cursor

    const upstream = await fetch(
      `${SMARTLEAD_BASE}/api/email-campaigns/${campaignId}/leads/filter`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    const text = await upstream.text()
    if (!upstream.ok) {
      throw new Error(
        `Smartlead bounce request failed (${upstream.status}) for campaign ${campaignId}. Response: ${preview(text)}`,
      )
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(
        `Smartlead bounce response for campaign ${campaignId} was not JSON. Response: ${preview(text)}`,
      )
    }
    const leads = objectValue(json).leads
    if (!Array.isArray(leads)) {
      throw new Error(
        `Smartlead bounce response for campaign ${campaignId} had no "leads" array.`,
      )
    }
    if (leads.length === 0) return { records, truncated: false }

    let added = 0
    for (const lead of leads) {
      const record = bounceRecordFromLead(lead)
      const leadId = String(objectValue(lead).id ?? '')
      if (!record || seen.has(leadId)) continue
      seen.add(leadId)
      records.push(record)
      added++
    }
    // No new leads means the cursor was ignored; stop rather than loop.
    if (added === 0) return { records, truncated: false }
    cursor = String(objectValue(leads[leads.length - 1]).id ?? '')
  }
  return { records, truncated: true }
}

function campaignIdsFrom(value: unknown): number[] {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  )
}

async function handleCampaignListBounces(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT ||
    (req.headers['x-smartlead-jwt'] as string) ||
    ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel Settings.',
    })
  }

  const campaignIds = campaignIdsFrom(objectValue(req.body).campaignIds)
  if (campaignIds.length === 0) {
    return res.status(400).json({
      error: 'Body must include a non-empty campaignIds array.',
    })
  }
  if (campaignIds.length > MAX_BOUNCE_CAMPAIGNS_PER_REQUEST) {
    return res.status(400).json({
      error: `A maximum of ${MAX_BOUNCE_CAMPAIGNS_PER_REQUEST} campaign IDs can be checked at once.`,
    })
  }

  const invalidRecipients = new Map<number, Set<string>>()
  const sequenceInvalidRecipients = new Map<string, Set<string>>()
  let scanned = 0
  let truncated = false

  try {
    for (const campaignId of campaignIds) {
      const campaignRecipients = new Set<string>()
      invalidRecipients.set(campaignId, campaignRecipients)
      const scan = await scanCampaignBounces(jwt, campaignId)
      scanned += scan.records.length
      truncated ||= scan.truncated

      for (const record of scan.records) {
        if (!isListIssueBounce(record.diagnostic, record.senderBounce)) continue
        // Count affected addresses, not retry events. Without an address,
        // fall back to the bounced email's own id.
        const identity = record.recipient || `event:${record.statsId}`
        campaignRecipients.add(identity)
        // leads/filter carries the step but not the A/B variant, so counts
        // are per step (variant 0).
        const sequenceKey = `${campaignId}:${record.seqId}:0`
        const sequenceRecipients =
          sequenceInvalidRecipients.get(sequenceKey) ?? new Set<string>()
        sequenceRecipients.add(identity)
        sequenceInvalidRecipients.set(sequenceKey, sequenceRecipients)
      }
    }

    const counts = campaignIds.map((campaignId) => ({
      campaignId,
      count: invalidRecipients.get(campaignId)?.size ?? 0,
    }))
    const sequenceCounts = Array.from(sequenceInvalidRecipients.entries()).map(
      ([key, recipients]) => {
        const [campaignId, emailCampaignSeqId, seqVariantId] = key
          .split(':')
          .map(Number)
        return {
          campaignId,
          emailCampaignSeqId,
          seqVariantId,
          count: recipients.size,
        }
      },
    )
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({ counts, sequenceCounts, scanned, truncated })
  } catch (error) {
    return res.status(502).json({
      error: `Campaign list-bounce analysis failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}

interface BlacklistListing {
  target: 'domain' | 'ip'
  rblName: string
  rblWebsite: string
  reason: string
}

interface DomainBlacklistStatus {
  domain: string
  ip: string | null
  domainBlacklistCount: number
  ipBlacklistCount: number
  totalTests: number
  listings: BlacklistListing[]
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toBlacklistListings(
  rows: unknown[],
  target: 'domain' | 'ip',
): BlacklistListing[] {
  return rows.map((row) => {
    const r = objectValue(row)
    return {
      target,
      rblName: String(r.rbl_name ?? ''),
      rblWebsite: String(r.rbl_website ?? ''),
      reason: String(r.reason ?? ''),
    }
  })
}

/**
 * Aggregate RBL/DNSBL blacklist status per sending domain across campaigns.
 * Smartlead exposes this per campaign, and each campaign response lists all of
 * its connected sending domains, so the client sends small chunks of campaign
 * IDs and we dedupe by domain (first writer wins — status is domain/IP-level).
 */
async function handleCampaignBlacklist(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT ||
    (req.headers['x-smartlead-jwt'] as string) ||
    ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel Settings.',
    })
  }

  const body = objectValue(req.body)
  const campaignIds = Array.from(
    new Set(
      arrayValue(body.campaignIds)
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).slice(0, BLACKLIST_MAX_CAMPAIGNS)
  if (campaignIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'Body must include a non-empty campaignIds array.' })
  }

  const byDomain = new Map<string, DomainBlacklistStatus>()
  const failures: number[] = []
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < campaignIds.length) {
      const id = campaignIds[cursor++]
      try {
        const upstream = await fetch(
          `${SMARTLEAD_BASE}/api/email-campaigns/${id}/black-list-domains`,
          { method: 'GET', headers: { Authorization: `Bearer ${jwt}` } },
        )
        if (!upstream.ok) {
          failures.push(id)
          continue
        }
        const json = JSON.parse(await upstream.text()) as unknown
        for (const entry of arrayValue(json)) {
          const domainInfo = objectValue(objectValue(entry).domain)
          const domain = String(domainInfo.domain ?? '')
            .trim()
            .toLowerCase()
          if (!domain || byDomain.has(domain)) continue

          const ipInfo = objectValue(objectValue(entry).ip)
          const summary = objectValue(domainInfo.summary)
          const domainListings = arrayValue(domainInfo.blacklisted)
          const ipListings = arrayValue(ipInfo.blacklisted)

          byDomain.set(domain, {
            domain,
            ip: ipInfo.ip
              ? String(ipInfo.ip)
              : summary.ip
                ? String(summary.ip)
                : null,
            domainBlacklistCount: domainListings.length,
            ipBlacklistCount: ipListings.length,
            totalTests: Number(summary.totalTests) || domainListings.length,
            listings: [
              ...toBlacklistListings(domainListings, 'domain'),
              ...toBlacklistListings(ipListings, 'ip'),
            ],
          })
        }
      } catch {
        failures.push(id)
      }
    }
  }

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(BLACKLIST_CONCURRENCY, campaignIds.length) },
        worker,
      ),
    )
  } catch (error) {
    return res.status(502).json({
      error: `Blacklist proxy failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  res.setHeader('cache-control', 'private, max-age=0, no-store')
  return res
    .status(200)
    .json({ domains: Array.from(byDomain.values()), failures })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const mode = Array.isArray(req.query.mode)
    ? req.query.mode[0]
    : req.query.mode
  if (mode === 'campaign-list-bounces') {
    return handleCampaignListBounces(req, res)
  }
  if (mode === 'blacklist') {
    return handleCampaignBlacklist(req, res)
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  const start = Array.isArray(req.query.start)
    ? req.query.start[0]
    : req.query.start
  const end = Array.isArray(req.query.end) ? req.query.end[0] : req.query.end
  if (!validDate(start) || !validDate(end)) {
    return res
      .status(400)
      .json({ error: 'Query must include start and end dates (YYYY-MM-DD).' })
  }

  const startAt = dateBoundary(start)
  const endAt = dateBoundary(end, true)
  const rangeDays = Math.ceil(
    (endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000),
  )
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    rangeDays < 1
  ) {
    return res.status(400).json({ error: 'End date must not precede start date.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT ||
    (req.headers['x-smartlead-jwt'] as string) ||
    ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel Settings.',
    })
  }

  if (mode !== 'risks') {
    const params = new URLSearchParams({
      start_date: start,
      end_date: end,
      timezone: 'Etc/GMT',
      full_data: 'true',
    })
    try {
      const upstream = await fetch(
        `${SMARTLEAD_BASE}/api/analytics/mailbox/domain-wise-health-metrics?${params}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'content-type': 'application/json',
          },
        },
      )
      const text = await upstream.text()
      res.status(upstream.status)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.send(text)
    } catch (error) {
      return res.status(502).json({
        error: `Domain-health proxy failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }

  if (rangeDays > MAX_RANGE_DAYS) {
    return res.status(400).json({
      error: `Inbox-risk date range must not exceed ${MAX_RANGE_DAYS} days.`,
    })
  }

  const rawCampaignId = Array.isArray(req.query.campaignId)
    ? req.query.campaignId[0]
    : req.query.campaignId
  const campaignId = Number(rawCampaignId)
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return res.status(400).json({
      error:
        'Inbox risks are scanned one campaign at a time: provide ?campaignId=<id>.',
    })
  }

  // As before: a bounce falls in the range by its bounce-notice time, or by
  // its send time when no notice time was recorded.
  const startMs = startAt.getTime()
  const endMs = endAt.getTime()
  const occurredAtOf = (record: BounceRecord) =>
    record.replyTime ?? record.sentTime ?? ''
  const inRange = (record: BounceRecord) => {
    const ms = Date.parse(occurredAtOf(record))
    return Number.isFinite(ms) && ms >= startMs && ms < endMs
  }

  const domainMap = new Map<string, DomainRiskAccumulator>()

  try {
    const scan = await scanCampaignBounces(jwt, campaignId)

    for (const record of scan.records) {
      if (!inRange(record)) continue
      const risk = classifyRisk(record.diagnostic)
      if (!risk) continue

      const senderEmail = record.senderEmail
      const at = senderEmail.lastIndexOf('@')
      const domain = at >= 0 ? senderEmail.slice(at + 1) : ''
      if (!domain) continue

      const occurredAt = occurredAtOf(record)
      const current = domainMap.get(domain) ?? {
        domain,
        total: 0,
        latestAt: '',
        inboxes: new Set<string>(),
        categories: new Map<RiskCategory, { label: string; count: number }>(),
        samples: [],
      }

      current.total += 1
      current.inboxes.add(senderEmail)
      if (!current.latestAt || occurredAt > current.latestAt) {
        current.latestAt = occurredAt
      }
      const category = current.categories.get(risk.category)
      if (category) category.count += 1
      else {
        current.categories.set(risk.category, { label: risk.label, count: 1 })
      }
      if (current.samples.length < 5) {
        current.samples.push({
          senderEmail,
          category: risk.category,
          label: risk.label,
          occurredAt,
          diagnostic: record.diagnostic.slice(0, 320),
          senderBounce: record.senderBounce,
        })
      }
      domainMap.set(domain, current)
    }

    const risks = Array.from(domainMap.values())
      .map((risk) => ({
        domain: risk.domain,
        total: risk.total,
        affectedInboxes: risk.inboxes.size,
        latestAt: risk.latestAt,
        inboxes: Array.from(risk.inboxes).sort(),
        categories: Array.from(risk.categories.entries())
          .map(([category, value]) => ({ category, ...value }))
          .sort((a, b) => b.count - a.count),
        samples: risk.samples,
      }))
      .sort((a, b) => b.total - a.total || a.domain.localeCompare(b.domain))

    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({
      risks,
      scanned: scan.records.length,
      truncated: scan.truncated,
    })
  } catch (error) {
    return res.status(502).json({
      error: `Bounce-risk scan failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}
