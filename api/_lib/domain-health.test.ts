import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import handler, { bounceRecordFromLead } from '../domain-health.js'

/** A blocked lead in the shape leads/filter returns (fields trimmed). */
function bouncedLead(
  id: number,
  opts: {
    from?: string
    to?: string
    text?: string
    seqId?: number
    category?: number | null
    replyTime?: string | null
    sentTime?: string
  } = {},
) {
  const stats = {
    id: `stats-${id}`,
    sent_time: opts.sentTime ?? '2026-09-25T15:04:48.719+00:00',
    reply_time: opts.replyTime === undefined ? '2026-09-26T12:25:17+00:00' : opts.replyTime,
    is_bounced: true,
    email_campaign_seq_id: opts.seqId ?? 111,
    reply_message_details: { text: opts.text ?? '550 5.1.1 The email account does not exist' },
    email_details: {
      from: opts.from ?? 'sender@acme.com',
      email: opts.to ?? `lead${id}@example.com`,
    },
  }
  return {
    id: String(id),
    status: 'BLOCKED',
    lead_category_id: opts.category ?? null,
    email_lead: { email: opts.to ?? `lead${id}@example.com` },
    email_account: { username: opts.from ?? 'sender@acme.com' },
    latest_email_stats: stats,
    latest_reply_stats: { id: stats.id, reply_time: stats.reply_time, reply_message_details: stats.reply_message_details },
  }
}

let calls: Array<{ url: string; body: Record<string, unknown> }>
/** Pages of leads the fake Smartlead serves, in cursor order. */
let pages: unknown[][]

beforeEach(() => {
  process.env.SMARTLEAD_JWT = 'test-jwt'
  calls = []
  pages = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    calls.push({ url, body })
    // Serve the page after the one whose last lead matches the cursor.
    const cursor = body.lastSeenLeadId
    const index = cursor
      ? pages.findIndex((page) => String((page[page.length - 1] as { id: string }).id) === cursor) + 1
      : 0
    return { ok: true, status: 200, text: async () => JSON.stringify({ leads: pages[index] ?? [] }) }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeRes() {
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
  return { res, captured }
}

const listBounces = (campaignIds: number[]) =>
  ({
    method: 'POST',
    headers: {},
    query: { mode: 'campaign-list-bounces' },
    body: { campaignIds },
  }) as unknown as VercelRequest

const risks = (query: Record<string, string>) =>
  ({
    method: 'GET',
    headers: {},
    query: { mode: 'risks', start: '2026-09-20', end: '2026-09-27', ...query },
    body: {},
  }) as unknown as VercelRequest

describe('bounced lead mapping', () => {
  it('reads the bounce notice, sender and recipient from a blocked lead', () => {
    expect(bounceRecordFromLead(bouncedLead(7, { category: 9 }))).toEqual({
      statsId: 'stats-7',
      seqId: 111,
      recipient: 'lead7@example.com',
      senderEmail: 'sender@acme.com',
      replyTime: '2026-09-26T12:25:17+00:00',
      sentTime: '2026-09-25T15:04:48.719+00:00',
      diagnostic: '550 5.1.1 The email account does not exist',
      senderBounce: true,
    })
  })
})

describe('bounced-lead paging', () => {
  it("pages with Smartlead's lastSeenLeadId cursor using its own bounce filter", async () => {
    pages = [
      [bouncedLead(1), bouncedLead(2)],
      [bouncedLead(3)],
    ]
    const { res, captured } = fakeRes()
    await handler(listBounces([4024214]), res)

    expect(calls.map((c) => c.url)).toEqual(
      Array(3).fill('https://server.smartlead.ai/api/email-campaigns/4024214/leads/filter'),
    )
    expect(calls[0].body).toEqual({
      limit: 100,
      statusFilter: 'failed',
      leadStatuses: ['BLOCKED'],
      fieldSet: 'active_table',
    })
    expect(calls[1].body.lastSeenLeadId).toBe('2')
    expect(calls[2].body.lastSeenLeadId).toBe('3')
    expect(captured.body.scanned).toBe(3)
    expect(captured.body.truncated).toBe(false)
  })
})

describe('invalid-recipient bounce counts', () => {
  it('counts bad-address bounces per step, once per address', async () => {
    pages = [
      [
        bouncedLead(1, { to: 'gone@example.com', seqId: 111 }),
        bouncedLead(2, { to: 'gone@example.com', seqId: 111 }),
        bouncedLead(3, { to: 'typo@example.com', seqId: 222 }),
        // Reputation rejections and sender bounces are not list problems.
        bouncedLead(4, { text: '550 5.7.1 rejected: poor sender reputation' }),
        bouncedLead(5, { category: 9 }),
      ],
    ]
    const { res, captured } = fakeRes()
    await handler(listBounces([4024214]), res)

    expect(captured.status).toBe(200)
    expect(captured.body.counts).toEqual([{ campaignId: 4024214, count: 2 }])
    expect(captured.body.sequenceCounts).toEqual([
      { campaignId: 4024214, emailCampaignSeqId: 111, seqVariantId: 0, count: 1 },
      { campaignId: 4024214, emailCampaignSeqId: 222, seqVariantId: 0, count: 1 },
    ])
  })
})

describe('domain bounce risks', () => {
  it('groups classified bounces by sending domain within the date range', async () => {
    pages = [
      [
        bouncedLead(1, { from: 'a@acme.com', text: '550 5.7.705 Tenant has exceeded threshold', category: 9 }),
        bouncedLead(2, { from: 'b@acme.com', text: '550 5.7.705 Tenant has exceeded threshold' }),
        bouncedLead(3, { from: 'c@other.com', text: 'Message rejected as spam by policy' }),
        // A plain bad address is not an inbox risk.
        bouncedLead(4, { from: 'd@other.com' }),
        // Outside the range, dated by its bounce notice.
        bouncedLead(5, { from: 'e@acme.com', text: 'Tenant threshold exceeded', replyTime: '2026-09-01T00:00:00Z' }),
        // No notice time: falls back to the send time, which is in range.
        bouncedLead(6, { from: 'f@acme.com', text: 'Tenant threshold exceeded', replyTime: null, sentTime: '2026-09-22T10:00:00Z' }),
      ],
    ]
    const { res, captured } = fakeRes()
    await handler(risks({ campaignId: '4024214' }), res)

    expect(captured.status).toBe(200)
    const rows = captured.body.risks as Array<Record<string, unknown>>
    expect(rows.map((r) => [r.domain, r.total, r.affectedInboxes])).toEqual([
      ['acme.com', 3, 3],
      ['other.com', 1, 1],
    ])
    expect(rows[0].categories).toEqual([
      { category: 'tenant_threshold', label: 'Tenant threshold exceeded', count: 3 },
    ])
  })

  it('requires a campaign, since Smartlead has no account-wide bounce query', async () => {
    const { res, captured } = fakeRes()
    await handler(risks({}), res)

    expect(captured.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it("relays Smartlead's failure instead of reporting no risks", async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 503,
      text: async () => '<html>503 Service Temporarily Unavailable</html>',
    }))
    const { res, captured } = fakeRes()
    await handler(risks({ campaignId: '1' }), res)

    expect(captured.status).toBe(502)
    expect(String(captured.body.error)).toContain('503')
  })
})
