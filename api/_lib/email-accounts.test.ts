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

/** The warmup config block, as the Domain Management card sends it. */
function warmupSettings(overrides: Record<string, unknown> = {}) {
  return {
    action: 'warmup',
    domains: ['acme.com'],
    accounts: ACCOUNTS,
    settings: {
      isRampupEnabled: false,
      maxEmailPerDay: 9,
      warmupMinCount: 7,
      warmupMaxCount: 9,
      rampupValue: 1,
      replyRate: 60,
      status: 'ACTIVE',
      warmupTagIdentifier: 'hey-there',
      ...overrides,
    },
  }
}

describe('warmup settings update', () => {
  it('still writes the config block, without a status field', async () => {
    const { res, captured } = fakeRes()
    await handler(fakeReq(warmupSettings()), res)

    expect(captured.status).toBe(200)
    // Status is carried by the separate warmup_toggle write, so that pressing
    // "Update warmup settings" cannot silently switch warmup back on.
    expect(calls[0].body.updateData).toEqual({
      dailyReplyLimit: null,
      isRampupEnabled: false,
      maxEmailPerDay: 9,
      warmupMinCount: 7,
      warmupMaxCount: 9,
      rampupValue: 1,
      replyRate: 60,
      warmupTagIdentifier: 'hey-there',
    })
  })

  // The randomise range is what let an inbox send 4 warmups on a 9-email day.
  // These names come from Smartlead's own bulk payload, so they are pinned.
  it('sends the randomise range Smartlead uses for warmup volume', async () => {
    const { res } = fakeRes()
    await handler(
      fakeReq(
        warmupSettings({
          maxEmailPerDay: 4,
          warmupMinCount: 3,
          warmupMaxCount: 4,
        }),
      ),
      res,
    )

    const updateData = calls[0].body.updateData as Record<string, unknown>
    expect(updateData.warmupMinCount).toBe(3)
    expect(updateData.warmupMaxCount).toBe(4)
    expect(updateData.maxEmailPerDay).toBe(4)
  })

  it('rejects a minimum above the maximum instead of writing it', async () => {
    const { res, captured } = fakeRes()
    await handler(
      fakeReq(warmupSettings({ warmupMinCount: 9, warmupMaxCount: 4 })),
      res,
    )

    expect(captured.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})
