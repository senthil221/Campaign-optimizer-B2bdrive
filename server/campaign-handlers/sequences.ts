import type { VercelRequest, VercelResponse } from '@vercel/node'
import { smartleadJwt } from '../../api/_lib/smartlead-jwt.js'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// Smartlead retired its GraphQL host; its new UI reads per-step analytics here.
const sequenceAnalyticsUrl = (campaignId: number) =>
  `${SMARTLEAD_BASE}/api/email-campaigns/${campaignId}/sequence-analytics`

type Json = Record<string, unknown>

function obj(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {}
}

/** A step's total_stats or a variant's stats, recognised by a numeric sent_count. */
function statsOf(value: unknown, key: 'total_stats' | 'stats'): Json | null {
  const stats = obj(obj(value)[key])
  return typeof stats.sent_count === 'number' ? stats : null
}

function row(
  campaignId: number,
  step: Json,
  stats: Json,
  variant: { id: unknown; label: unknown } | null,
): Json {
  const seqId = step.email_campaign_seq_id ?? step.id ?? null
  return {
    id: variant?.id ?? seqId,
    email_campaign_id: campaignId,
    seq_number: step.seq_number ?? null,
    variant_label: variant?.label ?? null,
    seq_variant_id: variant?.id ?? null,
    email_campaign_seq_mapping: { id: seqId },
    sent_count: stats.sent_count,
    open_count: stats.open_count,
    click_count: stats.click_count,
    reply_count: stats.reply_count,
    positive_reply_count: stats.positive_reply_count,
    bounce_count: stats.bounce_count,
    sender_bounce_count: stats.sender_bounce_count,
    unsubscribed_count: stats.unsubscribed_count,
    skipped_count: stats.skipped_count,
  }
}

/**
 * sequence-analytics nests variants under each step; the client reads the old
 * flat grouped_email_campaign_stats rows (one per step, or per step+variant).
 * A step with two or more variants splits into variant rows when every variant
 * carries its own stats; otherwise it is one row with the step's totals, so an
 * unfamiliar variant format loses detail rather than showing zeros.
 */
export function sequenceRows(campaignId: number, payload: unknown): Json[] | null {
  const sequences = obj(obj(payload).data).sequences
  if (!Array.isArray(sequences)) return null

  return sequences
    .map(obj)
    .sort((a, b) => Number(a.seq_number ?? 0) - Number(b.seq_number ?? 0))
    .flatMap((step) => {
      const variants = Array.isArray(step.variants) ? step.variants.map(obj) : []
      const variantStats = variants.map((variant) => statsOf(variant, 'stats'))
      // One variant is the step itself; keeping it a step row keeps the
      // per-step invalid-bounce count and per-step replies, which Smartlead's
      // lead data cannot split by variant.
      if (variants.length > 1 && variantStats.every((stats) => stats !== null)) {
        return variants.map((variant, i) =>
          row(campaignId, step, variantStats[i]!, {
            id: variant.id,
            label: variant.variant_label,
          }),
        )
      }
      const stepStats = statsOf(step, 'total_stats')
      return stepStats ? [row(campaignId, step, stepStats, null)] : []
    })
}

function preview(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text
}

// GET /api/campaign-sequences?id=123 → per-sequence/variant analytics for one campaign
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt = smartleadJwt(req)
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }

  const id = Number(req.query.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Provide a numeric ?id=<campaignId>.' })
  }

  try {
    const upstream = await fetch(sequenceAnalyticsUrl(id), {
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}` },
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Smartlead sequence analytics failed (${upstream.status}). Response: ${preview(text)}`,
      })
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return res.status(502).json({
        error: `Smartlead sequence analytics was not JSON. Response: ${preview(text)}`,
      })
    }
    const rows = sequenceRows(id, json)
    if (!rows) {
      return res.status(502).json({
        error: `Smartlead sequence analytics had no data.sequences array. Top-level keys: ${
          Object.keys(obj(json)).join(', ') || '(none)'
        }.`,
      })
    }

    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({ grouped_email_campaign_stats: rows })
  } catch (e) {
    return res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
