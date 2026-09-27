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

// POST /api/campaign-inbox { campaignId, offset?, limit? }
//   → { email_campaign_stats: [...] }, one page of a campaign's replies
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

  if (Number(body.seqId) > 0 || Number(body.variantId) > 0) {
    return res.status(501).json({
      error:
        "Replies for a single sequence step or variant aren't available yet on Smartlead's new API. Open replies from the campaign row instead.",
    })
  }

  const offset = Math.max(0, Number(body.offset) || 0)
  const rawLimit = Number(body.limit)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20

  try {
    // Smartlead's own request carries no offset, so rather than invent a
    // paging field, ask for everything up to the end of this page and slice.
    const upstream = await fetch(leadsFilterUrl(campaignId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        limit: offset + limit,
        statusFilter: 'replied',
        emailStatuses: ['got_reply'],
        fieldSet: 'active_table',
      }),
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Smartlead replies request failed (${upstream.status}). Response: ${preview(text)}`,
      })
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return res.status(502).json({
        error: `Smartlead replies response was not JSON. Response: ${preview(text)}`,
      })
    }
    const leads = Array.isArray(obj(json).leads) ? (obj(json).leads as unknown[]) : null
    if (!leads) {
      return res.status(502).json({
        error: `Smartlead replies response had no "leads" array. Top-level keys: ${
          Object.keys(obj(json)).join(', ') || '(none)'
        }.`,
      })
    }

    const rows = leads
      .slice(offset, offset + limit)
      .map(replyRowFromLead)
      .filter((row): row is Json => row !== null)

    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({ email_campaign_stats: rows })
  } catch (e) {
    return res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
