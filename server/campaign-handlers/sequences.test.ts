import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import handler, { sequenceRows } from './sequences.js'

// Step 1 exactly as captured from sequence-analytics (variant block truncated).
const STEP_1 = {
  id: 10968607,
  email_campaign_seq_id: 10968607,
  seq_number: 1,
  seq_type: 'EMAIL',
  total_stats: {
    sent_count: 2854,
    open_count: 0,
    click_count: 0,
    reply_count: 3,
    bounce_count: 38,
    sender_bounce_count: 14,
    unsubscribed_count: 0,
    skipped_count: 0,
    positive_reply_count: 0,
    reply_percentage: 0.11,
    bounce_percentage: 0.84,
  },
  variants: [{ id: 7807480, variant_label: 'A', is_baseline: true }],
}

function stats(sent: number, replies: number) {
  return { ...STEP_1.total_stats, sent_count: sent, reply_count: replies }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sequence analytics rows', () => {
  it('shows a step as one row of its totals when variants carry no stats', () => {
    const rows = sequenceRows(4024214, { ok: true, data: { sequences: [STEP_1] } })

    expect(rows).toEqual([
      {
        id: 10968607,
        email_campaign_id: 4024214,
        seq_number: 1,
        variant_label: null,
        seq_variant_id: null,
        email_campaign_seq_mapping: { id: 10968607 },
        sent_count: 2854,
        open_count: 0,
        click_count: 0,
        reply_count: 3,
        positive_reply_count: 0,
        bounce_count: 38,
        sender_bounce_count: 14,
        unsubscribed_count: 0,
        skipped_count: 0,
      },
    ])
  })

  it('splits a step into variant rows when every variant has its own stats', () => {
    const step = {
      ...STEP_1,
      variants: [
        { id: 1, variant_label: 'A', total_stats: stats(1500, 2) },
        { id: 2, variant_label: 'B', total_stats: stats(1354, 1) },
      ],
    }
    const rows = sequenceRows(9, { data: { sequences: [step] } })!

    expect(rows.map((r) => [r.variant_label, r.seq_variant_id, r.sent_count, r.reply_count])).toEqual([
      ['A', 1, 1500, 2],
      ['B', 2, 1354, 1],
    ])
    expect(rows.every((r) => (r.email_campaign_seq_mapping as { id: number }).id === 10968607)).toBe(true)
  })

  it('falls back to step totals if even one variant lacks stats', () => {
    const step = {
      ...STEP_1,
      variants: [
        { id: 1, variant_label: 'A', total_stats: stats(1500, 2) },
        { id: 2, variant_label: 'B' },
      ],
    }
    const rows = sequenceRows(9, { data: { sequences: [step] } })!

    expect(rows).toHaveLength(1)
    expect(rows[0].sent_count).toBe(2854)
  })

  it('orders steps by sequence number', () => {
    const rows = sequenceRows(9, {
      data: {
        sequences: [
          { ...STEP_1, id: 3, email_campaign_seq_id: 3, seq_number: 2 },
          { ...STEP_1, id: 1, email_campaign_seq_id: 1, seq_number: 1 },
        ],
      },
    })!

    expect(rows.map((r) => r.seq_number)).toEqual([1, 2])
  })

  it('calls the new endpoint and returns the rows the table reads', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, data: { campaign_id: 4024214, sequences: [STEP_1] } }),
      }
    })
    const captured = { status: 0, body: {} as Record<string, unknown> }
    const res = {
      status(code: number) {
        captured.status = code
        return this
      },
      json(payload: Record<string, unknown>) {
        captured.body = payload
        return this
      },
      setHeader() {},
    } as unknown as VercelResponse

    await handler({ method: 'GET', headers: {}, query: { id: '4024214' } } as unknown as VercelRequest, res)

    expect(calls[0].url).toBe(
      'https://server.smartlead.ai/api/email-campaigns/4024214/sequence-analytics',
    )
    expect(calls[0].init.method).toBe('GET')
    expect(captured.status).toBe(200)
    expect((captured.body.grouped_email_campaign_stats as unknown[]).length).toBe(1)
  })
})
