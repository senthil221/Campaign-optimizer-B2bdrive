import type { VercelRequest, VercelResponse } from '@vercel/node'
import { smartleadJwt } from './_lib/smartlead-jwt.js'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// Smartlead retired its GraphQL host (fe-gql), and its new UI loads a
// campaign's replies from this per-campaign REST filter instead.
const leadsFilterUrl = (campaignId: number) =>
  `${SMARTLEAD_BASE}/api/email-campaigns/${campaignId}/leads/filter`

type Json = Record<string, unknown>

function obj(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {}
}

function hasKeys(value: Json): boolean {
  return Object.keys(value).length > 0
}

/**
 * One lead from leads/filter, as the email_campaign_stats row the client
 * already normalises. `latest_email_stats` carries the sent body and lead
 * details; `latest_reply_stats` pins the email the lead actually answered.
 */
export function replyRowFromLead(lead: unknown): Json | null {
  const l = obj(lead)
  const sent = obj(l.latest_email_stats)
  const reply = obj(l.latest_reply_stats)
  const base = hasKeys(reply) ? reply : sent
  if (!hasKeys(base)) return null

  // If another step went out after the reply, latest_email_stats is that later
  // email: its body and step number are not what the lead replied to.
  const sameEmail = !reply.id || reply.id === sent.id

  const emailLead = obj(l.email_lead)
  const details: Json = hasKeys(obj(sent.email_details))
    ? { ...obj(sent.email_details) }
    : {
        email: emailLead.email,
        firstName: emailLead.first_name,
        lastName: emailLead.last_name,
        from: obj(l.email_account).username,
      }
  if (!sameEmail) delete details.emailSeqNumber

  return {
    id: base.id ?? null,
    sent_time: base.sent_time ?? null,
    reply_time: base.reply_time ?? null,
    got_reply: true,
    is_bounced: base.is_bounced === true,
    is_opened: sameEmail && sent.is_opened === true,
    is_clicked: sameEmail && sent.is_clicked === true,
    email_campaign_seq_id: base.email_campaign_seq_id ?? null,
    reply_message_details:
      base.reply_message_details ?? sent.reply_message_details ?? null,
    email_details: details,
    custom_email_message: sameEmail ? (sent.custom_email_message ?? null) : null,
  }
}

function preview(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text
}

// Smartlead's own UI pages replies 25 at a time.
const REPLY_PAGE_SIZE = 25
// A step filter scans pages until it has a page of matches; this bounds one
// request, and the returned cursor lets the drawer continue from there.
const MAX_SCAN_PAGES = 20

export interface ReplyCursor {
  leadId: string
  replyTime: string | null
}

/** ISO time in the form Smartlead's own cursor uses (…T18:09:14.000Z). */
function isoTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** Where the next page starts: after this lead, as Smartlead's cursor names it. */
export function cursorAfter(lead: unknown): ReplyCursor | null {
  const l = obj(lead)
  const leadId = String(l.id ?? '').trim()
  if (!leadId) return null
  return {
    leadId,
    replyTime:
      isoTime(l.latest_reply_time) ?? isoTime(obj(l.latest_reply_stats).reply_time),
  }
}

function cursorFrom(value: unknown): ReplyCursor | null {
  const c = obj(value)
  const leadId = String(c.leadId ?? '').trim()
  if (!leadId) return null
  return { leadId, replyTime: isoTime(c.replyTime) }
}

/** The replied-leads request exactly as Smartlead's UI sends it. */
export function repliesRequestBody(cursor: ReplyCursor | null): Json {
  return {
    limit: REPLY_PAGE_SIZE,
    ...(cursor ? { lastSeenLeadId: cursor.leadId } : {}),
    ...(cursor?.replyTime ? { lastSeenReplyTime: cursor.replyTime } : {}),
    statusFilter: 'replied',
    emailStatuses: ['got_reply'],
    fieldSet: 'active_table',
  }
}

class UpstreamFailure extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function fetchRepliesPage(
  jwt: string,
  campaignId: number,
  cursor: ReplyCursor | null,
): Promise<unknown[]> {
  const upstream = await fetch(leadsFilterUrl(campaignId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(repliesRequestBody(cursor)),
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    throw new UpstreamFailure(
      upstream.status,
      `Smartlead replies request failed (${upstream.status}). Response: ${preview(text)}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new UpstreamFailure(502, `Smartlead replies response was not JSON. Response: ${preview(text)}`)
  }
  const leads = obj(json).leads
  if (!Array.isArray(leads)) {
    throw new UpstreamFailure(
      502,
      `Smartlead replies response had no "leads" array. Top-level keys: ${
        Object.keys(obj(json)).join(', ') || '(none)'
      }.`,
    )
  }
  return leads
}

// POST /api/campaign-inbox { campaignId, cursor?, seqId? }
//   → { email_campaign_stats: [...], nextCursor }
// One page of a campaign's replies. With seqId, only replies to that sequence
// step: each reply records the step it answered (email_campaign_seq_id).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = smartleadJwt(req)
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const body = (req.body ?? {}) as Json
  const campaignId = Number(body.campaignId)
  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    return res.status(400).json({ error: 'Body must include a numeric "campaignId".' })
  }

  // Replies record their step but not their A/B variant.
  if (Number(body.variantId) > 0) {
    return res.status(501).json({
      error:
        "Replies can't be split by A/B variant: Smartlead's reply data records the step but not the variant. Open replies from the step or the campaign row instead.",
    })
  }
  const seqId = Number(body.seqId) > 0 ? Number(body.seqId) : null

  try {
    let cursor = cursorFrom(body.cursor)
    const rows: Json[] = []

    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      const leads = await fetchRepliesPage(jwt, campaignId, cursor)
      for (const lead of leads) {
        const row = replyRowFromLead(lead)
        if (!row) continue
        if (seqId !== null && Number(row.email_campaign_seq_id) !== seqId) continue
        rows.push(row)
      }
      // A short page is the last one.
      cursor = leads.length < REPLY_PAGE_SIZE ? null : cursorAfter(leads[leads.length - 1])
      // Unfiltered, one Smartlead page is one drawer page. Filtered, keep
      // scanning until a page's worth of matches has been found.
      if (!cursor || seqId === null || rows.length >= REPLY_PAGE_SIZE) break
    }

    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({ email_campaign_stats: rows, nextCursor: cursor })
  } catch (e) {
    const status = e instanceof UpstreamFailure ? e.status : 502
    return res.status(status).json({
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
