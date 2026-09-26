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
function lead(n: number, overrides: Record<string, unknown> = {}) {
  const stats = {
    id: `stat-${n}`,
    sent_time: '2026-09-25T15:04:48.719+00:00',
    reply_time: '2026-09-26T12:25:17+00:00',
    is_opened: true,
    is_clicked: false,
    is_bounced: false,
    got_reply: true,
    custom_email_message: `<p>Sent body ${n}</p>`,
    email_campaign_seq_id: 111,
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
    id: `${n}`,
    email_lead: { email: `lead${n}@example.com`, first_name: 'Lead', last_name: `${n}` },
    email_account: { username: 'sender@example.com' },
    latest_email_stats: stats,
    latest_reply_stats: {
      id: stats.id,
      sent_time: stats.sent_time,
      reply_time: stats.reply_time,
      is_bounced: false,
      got_reply: true,
      email_campaign_seq_id: 111,
      reply_message_details: stats.reply_message_details,
    },
    ...overrides,
  }
}

let calls: Array<{ url: string; init: RequestInit }>
let upstream: { ok: boolean; status: number; text: string }

beforeEach(() => {
  process.env.SMARTLEAD_JWT = 'test-jwt'
  calls = []
  upstream = {
    ok: true,
    status: 200,
    text: JSON.stringify({ leads: Array.from({ length: 45 }, (_, i) => lead(i + 1)) }),
  }
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return { ok: upstream.ok, status: upstream.status, text: async () => upstream.text }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('campaign replies via leads/filter', () => {
  it("sends Smartlead's own replied-leads payload", async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 4024214, limit: 20 }), res)

    expect(captured.status).toBe(200)
    expect(calls[0].url).toBe(
      'https://server.smartlead.ai/api/email-campaigns/4024214/leads/filter',
    )
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-jwt',
    )
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      limit: 20,
      statusFilter: 'replied',
      emailStatuses: ['got_reply'],
      fieldSet: 'active_table',
    })
  })

  it('returns rows in the shape the drawer already reads', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1, limit: 20 }), res)

    const rows = captured.body.email_campaign_stats as Array<Record<string, unknown>>
    expect(rows).toHaveLength(20)
    expect(rows[0]).toMatchObject({
      id: 'stat-1',
      reply_time: '2026-09-26T12:25:17+00:00',
      is_opened: true,
      custom_email_message: '<p>Sent body 1</p>',
      email_details: { email: 'lead1@example.com', emailSeqNumber: 1 },
      reply_message_details: { subject: 'Re: hello 1' },
    })
  })

  it('pages without a guessed offset field by widening the window and slicing', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1, offset: 40, limit: 20 }), res)

    expect(JSON.parse(String(calls[0].init.body)).limit).toBe(60)
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty('offset')
    const rows = captured.body.email_campaign_stats as Array<Record<string, unknown>>
    expect(rows.map((r) => r.id)).toEqual(['stat-41', 'stat-42', 'stat-43', 'stat-44', 'stat-45'])
  })

  it('drops the sent body when a later step went out after the reply', () => {
    const row = replyRowFromLead(
      lead(1, {
        latest_email_stats: {
          ...lead(1).latest_email_stats,
          id: 'later-step',
          custom_email_message: '<p>Step 2 body</p>',
          email_details: { ...lead(1).latest_email_stats.email_details, emailSeqNumber: 2 },
        },
      }),
    )

    expect(row?.id).toBe('stat-1')
    expect(row?.custom_email_message).toBeNull()
    expect(row?.email_details).not.toHaveProperty('emailSeqNumber')
  })

  it('refuses step and variant filters instead of showing unfiltered replies', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1, seqId: 111, variantId: 5 }), res)

    expect(captured.status).toBe(501)
    expect(calls).toHaveLength(0)
  })

  it("surfaces Smartlead's status and body when the request fails", async () => {
    upstream = { ok: false, status: 503, text: '<html>503 Service Temporarily Unavailable</html>' }
    const { res, captured } = fakeRes()
    await handler(fakeReq({ campaignId: 1 }), res)

    expect(captured.status).toBe(503)
    expect(String(captured.body.error)).toContain('503')
  })
})
