import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import handler, { replyRowFromLead } from '../campaign-inbox.js'

function fakeReq(body: unknown): VercelRequest {
  return { method: 'POST', body, headers: {}, query: {} } as unknown as VercelRequest
}

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

/** A replied lead in the shape leads/filter returns (fields trimmed). */
function lead(n: number, seqId = 111, overrides: Record<string, unknown> = {}) {
  const stats = {
    id: `stat-${n}`,
    sent_time: '2026-09-18T06:51:14.473+00:00',
    reply_time: '2026-09-18T16:12:31+00:00',
    is_opened: true,
    is_clicked: false,
    is_bounced: false,
    got_reply: true,
    custom_email_message: `<p>Sent body ${n}</p>`,
    email_campaign_seq_id: seqId,
    reply_message_details: { subject: `Re: hello ${n}`, visibleText: `reply ${n}` },
    email_details: {
      from: 'sender@example.com',
      email: `lead${n}@example.com`,
      firstName: 'Lead',
      lastName: `${n}`,
      emailSeqNumber: 1,
    },
  }
  return {
    id: String(3686997000 + n),
    latest_reply_time: '2026-09-18T16:12:31.000Z',
    email_lead: { email: `lead${n}@example.com`, first_name: 'Lead', last_name: `${n}` },
    email_account: { username: 'sender@example.com' },
    latest_email_stats: stats,
    latest_reply_stats: {
      id: stats.id,
      sent_time: stats.sent_time,
      reply_time: stats.reply_time,
      is_bounced: false,
      got_reply: true,
      email_campaign_seq_id: seqId,
      reply_message_details: stats.reply_message_details,
    },
    ...overrides,
  }
}

let bodies: Array<Record<string, unknown>>
let urls: string[]
/** All replied leads the fake Smartlead holds, served 25 at a time by cursor. */
let replied: ReturnType<typeof lead>[]
let failWith: { status: number; text: string } | null

beforeEach(() => {
  process.env.SMARTLEAD_JWT = 'test-jwt'
  bodies = []
  urls = []
  replied = []
  failWith = null
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    urls.push(url)
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    bodies.push(body)
    if (failWith) {
      const { status, text } = failWith
      return { ok: false, status, text: async () => text }
    }
    const start = body.lastSeenLeadId
      ? replied.findIndex((l) => l.id === body.lastSeenLeadId) + 1
      : 0
    const leads = replied.slice(start, start + Number(body.limit))
    return { ok: true, status: 200, text: async () => JSON.stringify({ leads }) }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('campaign replies via leads/filter', () => {
  it("opens with Smartlead's own replied-leads request", async () => {
    replied = [lead(1)]
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 3952088 }), res)

    expect(captured.status).toBe(200)
    expect(urls[0]).toBe(
      'https://server.smartlead.ai/api/email-campaigns/3952088/leads/filter',
    )
    expect(bodies[0]).toEqual({
      limit: 25,
      statusFilter: 'replied',
      emailStatuses: ['got_reply'],
      fieldSet: 'active_table',
    })
  })

  it('continues from a cursor exactly as Smartlead pages replies', async () => {
    replied = Array.from({ length: 30 }, (_, i) => lead(i + 1))
    const { res } = fakeRes()
    await handler(
      fakeReq({
        campaignId: 3952088,
        cursor: { leadId: '3686997301', replyTime: '2026-09-18T18:09:14+00:00' },
      }),
      res,
    )

    // As captured from Smartlead's UI (key order included).
    expect(JSON.stringify(bodies[0])).toBe(
      JSON.stringify({
        limit: 25,
        lastSeenLeadId: '3686997301',
        lastSeenReplyTime: '2026-09-18T18:09:14.000Z',
        statusFilter: 'replied',
        emailStatuses: ['got_reply'],
        fieldSet: 'active_table',
      }),
    )
  })

  it('hands back a cursor after a full page and none after the last', async () => {
    replied = Array.from({ length: 30 }, (_, i) => lead(i + 1))

    const first = fakeRes()
    await handler(fakeReq({ campaignId: 1 }), first.res)
    expect((first.captured.body.email_campaign_stats as unknown[]).length).toBe(25)
    expect(first.captured.body.nextCursor).toEqual({
      leadId: '3686997025',
      replyTime: '2026-09-18T16:12:31.000Z',
    })

    const second = fakeRes()
    await handler(
      fakeReq({ campaignId: 1, cursor: first.captured.body.nextCursor }),
      second.res,
    )
    expect((second.captured.body.email_campaign_stats as unknown[]).length).toBe(5)
    expect(second.captured.body.nextCursor).toBeNull()
  })

  it('returns rows in the shape the drawer already reads', async () => {
    replied = [lead(1)]
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1 }), res)

    const rows = captured.body.email_campaign_stats as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({
      id: 'stat-1',
      reply_time: '2026-09-18T16:12:31+00:00',
      is_opened: true,
      email_campaign_seq_id: 111,
      custom_email_message: '<p>Sent body 1</p>',
      email_details: { email: 'lead1@example.com', emailSeqNumber: 1 },
      reply_message_details: { subject: 'Re: hello 1' },
    })
  })
})

describe('replies to one sequence step', () => {
  it('keeps only replies to that step, scanning pages until it has a page of them', async () => {
    // 60 replies alternating between steps 111 and 222.
    replied = Array.from({ length: 60 }, (_, i) => lead(i + 1, i % 2 === 0 ? 111 : 222))
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1, seqId: 222 }), res)

    // Two Smartlead pages hold 12 + 13 step-222 replies: a page's worth.
    const rows = captured.body.email_campaign_stats as Array<Record<string, unknown>>
    expect(rows.every((r) => r.email_campaign_seq_id === 222)).toBe(true)
    expect(rows).toHaveLength(25)
    expect(bodies).toHaveLength(2)
    expect(captured.body.nextCursor).not.toBeNull()

    // The cursor picks up where the scan stopped; the last 5 finish the list.
    const next = fakeRes()
    await handler(
      fakeReq({ campaignId: 1, seqId: 222, cursor: captured.body.nextCursor }),
      next.res,
    )
    const rest = next.captured.body.email_campaign_stats as Array<Record<string, unknown>>
    expect(rest).toHaveLength(5)
    expect(rest.every((r) => r.email_campaign_seq_id === 222)).toBe(true)
    expect(next.captured.body.nextCursor).toBeNull()
  })

  it('refuses a variant filter, since replies do not record the variant', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1, seqId: 111, variantId: 5 }), res)

    expect(captured.status).toBe(501)
    expect(urls).toHaveLength(0)
  })
})

describe('reply row mapping', () => {
  it('drops the sent body when a later step went out after the reply', () => {
    const base = lead(1)
    const row = replyRowFromLead({
      ...base,
      latest_email_stats: {
        ...base.latest_email_stats,
        id: 'later-step',
        custom_email_message: '<p>Step 2 body</p>',
        email_details: { ...base.latest_email_stats.email_details, emailSeqNumber: 2 },
      },
    })

    expect(row?.id).toBe('stat-1')
    expect(row?.custom_email_message).toBeNull()
    expect(row?.email_details).not.toHaveProperty('emailSeqNumber')
  })
})

describe('upstream failures', () => {
  it("surfaces Smartlead's status and body", async () => {
    failWith = { status: 503, text: '<html>503 Service Temporarily Unavailable</html>' }
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1 }), res)

    expect(captured.status).toBe(503)
    expect(String(captured.body.error)).toContain('503')
  })
})
