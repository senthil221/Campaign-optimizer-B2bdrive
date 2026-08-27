import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import handler from '../email-accounts.js'

interface Captured {
  status: number
  body: Record<string, unknown>
}

function fakeReq(body: unknown): VercelRequest {
  return {
    method: 'POST',
    body,
    headers: {},
    query: {},
  } as unknown as VercelRequest
}

function fakeRes(): { res: VercelResponse; captured: Captured } {
  const captured: Captured = { status: 0, body: {} }
  const res = {
    status(code: number) {
      captured.status = code
      return this
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload
      return this
    },
    send(payload: unknown) {
      captured.body = { raw: payload }
      return this
    },
    setHeader() {},
  } as unknown as VercelResponse
  return { res, captured }
}

/** Two inboxes on one domain, in the shape updateDomainSettings expects. */
const ACCOUNTS = [
  { id: 21982731, from_email: 'a@acme.com' },
  { id: 21982728, from_email: 'b@acme.com' },
]

function warmupBody(status: string) {
  return {
    action: 'warmup_toggle',
    domains: ['acme.com'],
    accounts: ACCOUNTS,
    settings: { status },
  }
}

let calls: Array<{ url: string; body: Record<string, unknown> }>

beforeEach(() => {
  process.env.SMARTLEAD_JWT = 'test-jwt'
  // No DATABASE_URL, so the snapshot helpers stay inert.
  delete process.env.DATABASE_URL
  delete process.env.POSTGRES_URL
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ success: true }),
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('warmup enable/disable', () => {
  // Smartlead's own UI sends exactly { status, dailyReplyLimit } for this.
  // Sending the warmup config block alongside it is rejected with a 400, so
  // these assertions pin the payload to the one field.
  it('sends status ACTIVE and nothing from the warmup config block', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq(warmupBody('ACTIVE')), res)

    expect(captured.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain(
      '/api/email-account/bulk-update-email-account-config',
    )
    expect(calls[0].body).toEqual({
      emailAccountIds: [21982731, 21982728],
      updateData: { dailyReplyLimit: null, status: 'ACTIVE' },
      excludeEmailAccountIds: [],
    })
  })

  it('sends status INACTIVE to turn warmup off', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq(warmupBody('INACTIVE')), res)

    expect(captured.status).toBe(200)
    expect(calls[0].body.updateData).toEqual({
      dailyReplyLimit: null,
      status: 'INACTIVE',
    })
  })

  it('rejects any status other than ACTIVE or INACTIVE', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq(warmupBody('PAUSED')), res)

    expect(captured.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})

describe('warmup settings update', () => {
  it('still writes the config block, without a status field', async () => {
    const { res, captured } = fakeRes()
    await handler(
      fakeReq({
        action: 'warmup',
        domains: ['acme.com'],
        accounts: ACCOUNTS,
        settings: {
          isRampupEnabled: false,
          maxEmailPerDay: 9,
          rampupValue: 1,
          replyRate: 60,
          status: 'ACTIVE',
          warmupTagIdentifier: 'hey-there',
        },
      }),
      res,
    )

    expect(captured.status).toBe(200)
    // A status key here is what produced the 400; it must not be sent.
    expect(calls[0].body.updateData).toEqual({
      dailyReplyLimit: null,
      isRampupEnabled: false,
      maxEmailPerDay: 9,
      rampupValue: 1,
      replyRate: 60,
      warmupTagIdentifier: 'hey-there',
    })
  })
})
