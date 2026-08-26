import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import handler from './operations.js'

interface Captured {
  status: number
  body: Record<string, unknown>
  headers: Record<string, string>
}

/** Minimal stand-ins for the Vercel req/res pair the handler is written against. */
function fakeReq(body: unknown, method = 'POST'): VercelRequest {
  return { method, body, headers: {}, query: {} } as unknown as VercelRequest
}

function fakeRes(): { res: VercelResponse; captured: Captured } {
  const captured: Captured = { status: 0, body: {}, headers: {} }
  const res = {
    status(code: number) {
      captured.status = code
      return this
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload
      return this
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value
    },
  } as unknown as VercelResponse
  return { res, captured }
}

const OLD_JWT = process.env.SMARTLEAD_JWT

afterEach(() => {
  vi.unstubAllGlobals()
  process.env.SMARTLEAD_JWT = OLD_JWT
})

function stubFetch(
  impl: (url: string, init: RequestInit) => { ok: boolean; body?: string },
) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const { ok, body = '{}' } = impl(url, init)
    return {
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Internal Server Error',
      text: async () => body,
    }
  })
  return calls
}

describe('campaign operations handler', () => {
  it('posts to the per-campaign Smartlead route for each id', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    const calls = stubFetch(() => ({ ok: true }))
    const { res, captured } = fakeRes()

    await handler(
      fakeReq({ operation: 'reallocate-mailboxes', ids: [3859830, 42] }),
      res,
    )

    expect(calls.map((call) => call.url)).toEqual([
      'https://server.smartlead.ai/api/email-campaigns/3859830/reallocate-mailboxes',
      'https://server.smartlead.ai/api/email-campaigns/42/reallocate-mailboxes',
    ])
    expect(calls[0].init.method).toBe('POST')
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe('Bearer test-jwt')
    expect(captured.status).toBe(200)
    expect(captured.body.succeeded).toEqual([3859830, 42])
    expect(captured.body.failed).toEqual([])
  })

  it('uses the reschedule route for the other operation', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    const calls = stubFetch(() => ({ ok: true }))
    const { res } = fakeRes()

    await handler(
      fakeReq({ operation: 'reschedule-failed-leads', ids: [7] }),
      res,
    )

    expect(calls[0].url).toBe(
      'https://server.smartlead.ai/api/email-campaigns/7/reschedule-failed-leads',
    )
  })

  it('reports partial failures per campaign and returns 502', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    stubFetch((url) =>
      url.includes('/42/') ? { ok: false, body: 'nope' } : { ok: true },
    )
    const { res, captured } = fakeRes()

    await handler(
      fakeReq({ operation: 'reallocate-mailboxes', ids: [1, 42] }),
      res,
    )

    expect(captured.status).toBe(502)
    expect(captured.body.succeeded).toEqual([1])
    expect(captured.body.failed).toMatchObject([{ id: 42 }])
  })

  it('treats a 200 carrying success:false as a failure', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    stubFetch(() => ({
      ok: true,
      body: JSON.stringify({ success: false, message: 'campaign is archived' }),
    }))
    const { res, captured } = fakeRes()

    await handler(fakeReq({ operation: 'reallocate-mailboxes', ids: [1] }), res)

    expect(captured.status).toBe(502)
    expect(captured.body.failed).toMatchObject([
      { id: 1, error: 'campaign is archived' },
    ])
  })

  it('rejects an unknown operation before calling Smartlead', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    const calls = stubFetch(() => ({ ok: true }))
    const { res, captured } = fakeRes()

    await handler(fakeReq({ operation: 'drop-database', ids: [1] }), res)

    expect(captured.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('rejects an empty id list and non-POST methods', async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    stubFetch(() => ({ ok: true }))

    const empty = fakeRes()
    await handler(
      fakeReq({ operation: 'reallocate-mailboxes', ids: [] }),
      empty.res,
    )
    expect(empty.captured.status).toBe(400)

    const wrongMethod = fakeRes()
    await handler(fakeReq({}, 'GET'), wrongMethod.res)
    expect(wrongMethod.captured.status).toBe(405)
  })
})
