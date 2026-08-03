import type { VercelRequest, VercelResponse } from '@vercel/node'

const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'
const SMARTLEAD_BASE = 'https://server.smartlead.ai'
const PAGE_LIMIT = 100
const MAX_PAGES = 50
const MAX_RANGE_DAYS = 31
const CAMPAIGN_BOUNCE_PAGE_LIMIT = 500
const MAX_CAMPAIGN_BOUNCE_PAGES = 100

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

const BOUNCE_QUERY = `query getDomainBounceRisks($offset: Int!, $limit: Int!, $where: email_campaign_stats_bool_exp!) {
  email_campaign_stats(
    where: $where
    order_by: {reply_time: desc, sent_time: desc}
    offset: $offset
    limit: $limit
  ) {
    id
    is_bounced
    sent_time
    reply_time
    email_details
    reply_message_details
    email_campaign_leads_mapping {
      lead_category_id
    }
  }
}`

const CAMPAIGN_LIST_BOUNCE_QUERY = `query getCampaignListBounces($offset: Int!, $limit: Int!, $where: email_campaign_stats_bool_exp!) {
  email_campaign_stats(
    where: $where
    order_by: {id: asc}
    offset: $offset
    limit: $limit
  ) {
    id
    email_campaign_id
    email_campaign_seq_id
    seq_variant_id
    is_bounced
    reply_message_details
    email_details
    email_campaign_leads_mapping {
      lead_category_id
    }
  }
}`

function userIdFromJwt(jwt: string): number | null {
  try {
    const segment = jwt.split('.')[1]
    if (!segment) return null
    const payload = JSON.parse(
      Buffer.from(segment, 'base64').toString('utf8'),
    ) as Record<string, unknown>
    const claims =
      (payload['https://hasura.io/jwt/claims'] as Record<string, unknown>) ?? {}
    const raw =
      claims['x-hasura-user-id'] ??
      payload.user_id ??
      payload.id ??
      payload.sub
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
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

  const body = objectValue(req.body)
  const campaignIds = Array.from(
    new Set(
      (Array.isArray(body.campaignIds) ? body.campaignIds : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  )
  if (campaignIds.length === 0) {
    return res.status(400).json({
      error: 'Body must include a non-empty campaignIds array.',
    })
  }
  if (campaignIds.length > 1000) {
    return res.status(400).json({
      error: 'A maximum of 1,000 campaign IDs can be checked at once.',
    })
  }

  const userId = userIdFromJwt(jwt)
  if (!userId) {
    return res
      .status(401)
      .json({ error: 'Could not derive the Smartlead user ID from the JWT.' })
  }

  const where = {
    user_id: { _eq: userId },
    email_campaign_id: { _in: campaignIds },
    is_bounced: { _eq: true },
  }
  const invalidRecipients = new Map<number, Set<string>>()
  const sequenceInvalidRecipients = new Map<string, Set<string>>()
  campaignIds.forEach((campaignId) => {
    invalidRecipients.set(campaignId, new Set())
  })
  let scanned = 0
  let truncated = false

  try {
    for (let page = 0; page < MAX_CAMPAIGN_BOUNCE_PAGES; page++) {
      const upstream = await fetch(GQL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          operationName: 'getCampaignListBounces',
          variables: {
            offset: page * CAMPAIGN_BOUNCE_PAGE_LIMIT,
            limit: CAMPAIGN_BOUNCE_PAGE_LIMIT,
            where,
          },
          query: CAMPAIGN_LIST_BOUNCE_QUERY,
        }),
      })
      const responseText = await upstream.text()
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: `Smartlead campaign-bounce request failed (${upstream.status}).`,
        })
      }

      const payload = JSON.parse(responseText) as {
        data?: { email_campaign_stats?: unknown[] }
        errors?: Array<{ message?: string }>
      }
      if (payload.errors?.length) {
        return res.status(502).json({
          error:
            payload.errors.map((error) => error.message).filter(Boolean).join('; ') ||
            'Smartlead GraphQL returned an error.',
        })
      }

      const rows = payload.data?.email_campaign_stats ?? []
      if (rows.length === 0) break
      scanned += rows.length

      for (const value of rows) {
        const row = objectValue(value)
        const campaignId = Number(row.email_campaign_id)
        const campaignRecipients = invalidRecipients.get(campaignId)
        if (!campaignRecipients) continue

        const diagnostic = diagnosticText(row.reply_message_details)
        const senderBounce = isSenderBounce(row.email_campaign_leads_mapping)
        if (!isListIssueBounce(diagnostic, senderBounce)) continue

        // Count affected email addresses, not retry events. If Smartlead omits
        // the address, retain the event using its stable stats-row ID.
        const recipient = recipientEmail(row.email_details)
        const identity = recipient || `event:${String(row.id ?? '')}`
        if (identity !== 'event:') {
          campaignRecipients.add(identity)
          const sequenceId = Number(row.email_campaign_seq_id) || 0
          const variantId = Number(row.seq_variant_id) || 0
          const sequenceKey = `${campaignId}:${sequenceId}:${variantId}`
          const sequenceRecipients =
            sequenceInvalidRecipients.get(sequenceKey) ?? new Set<string>()
          sequenceRecipients.add(identity)
          sequenceInvalidRecipients.set(sequenceKey, sequenceRecipients)
        }
      }

      if (rows.length < CAMPAIGN_BOUNCE_PAGE_LIMIT) break
      if (page === MAX_CAMPAIGN_BOUNCE_PAGES - 1) truncated = true
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const mode = Array.isArray(req.query.mode)
    ? req.query.mode[0]
    : req.query.mode
  if (mode === 'campaign-list-bounces') {
    return handleCampaignListBounces(req, res)
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

  const userId = userIdFromJwt(jwt)
  if (!userId) {
    return res
      .status(401)
      .json({ error: 'Could not derive the Smartlead user ID from the JWT.' })
  }

  const where = {
    user_id: { _eq: userId },
    _and: [
      {
        _or: [
          { is_bounced: { _eq: true } },
          {
            email_campaign_leads_mapping: {
              lead_category_id: { _eq: 9 },
            },
          },
        ],
      },
      {
        _or: [
          {
            reply_time: {
              _gte: startAt.toISOString(),
              _lt: endAt.toISOString(),
            },
          },
          {
            _and: [
              { reply_time: { _is_null: true } },
              {
                sent_time: {
                  _gte: startAt.toISOString(),
                  _lt: endAt.toISOString(),
                },
              },
            ],
          },
        ],
      },
    ],
  }

  const domainMap = new Map<string, DomainRiskAccumulator>()
  let scanned = 0
  let truncated = false

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const upstream = await fetch(GQL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          operationName: 'getDomainBounceRisks',
          variables: {
            offset: page * PAGE_LIMIT,
            limit: PAGE_LIMIT,
            where,
          },
          query: BOUNCE_QUERY,
        }),
      })
      const text = await upstream.text()
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: `Smartlead bounce request failed (${upstream.status}).`,
        })
      }

      const payload = JSON.parse(text) as {
        data?: { email_campaign_stats?: unknown[] }
        errors?: Array<{ message?: string }>
      }
      if (payload.errors?.length) {
        return res.status(502).json({
          error:
            payload.errors.map((error) => error.message).filter(Boolean).join('; ') ||
            'Smartlead GraphQL returned an error.',
        })
      }

      const rows = payload.data?.email_campaign_stats ?? []
      if (rows.length === 0) break
      scanned += rows.length

      for (const value of rows) {
        const row = objectValue(value)
        const textValue = diagnosticText(row.reply_message_details)
        const risk = classifyRisk(textValue)
        if (!risk) continue

        const emailDetails = objectValue(row.email_details)
        const senderEmail = String(
          emailDetails.from ?? emailDetails.sender ?? '',
        )
          .trim()
          .toLowerCase()
        const at = senderEmail.lastIndexOf('@')
        const domain = at >= 0 ? senderEmail.slice(at + 1) : ''
        if (!domain) continue

        const occurredAt = String(row.reply_time ?? row.sent_time ?? '')
        const senderBounce = isSenderBounce(
          row.email_campaign_leads_mapping,
        )
        const current = domainMap.get(domain) ?? {
          domain,
          total: 0,
          latestAt: '',
          inboxes: new Set<string>(),
          categories: new Map<
            RiskCategory,
            { label: string; count: number }
          >(),
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
          current.categories.set(risk.category, {
            label: risk.label,
            count: 1,
          })
        }
        if (current.samples.length < 5) {
          current.samples.push({
            senderEmail,
            category: risk.category,
            label: risk.label,
            occurredAt,
            diagnostic: textValue.slice(0, 320),
            senderBounce,
          })
        }
        domainMap.set(domain, current)
      }

      if (rows.length < PAGE_LIMIT) break
      if (page === MAX_PAGES - 1) truncated = true
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
    return res.status(200).json({ risks, scanned, truncated })
  } catch (error) {
    return res.status(502).json({
      error: `Bounce-risk proxy failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}
