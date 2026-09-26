import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import readHandler from '../campaign-general-settings.js'
import updateHandler from '../campaign-schedule.js'

// GET /api/email-campaigns/4024214/settings, as captured from Smartlead.
const SETTINGS = {
  max_leads_per_day: 15000,
  scheduler_cron_value: {
    tz: 'America/Chicago',
    days: [0, 1, 2, 3, 4, 5, 6],
    endHour: '17:00',
    startHour: '09:10',
  },
  schedule_start_time: null,
  min_time_btwn_emails: 60,
  track_settings: ['DONT_EMAIL_OPEN', 'DONT_LINK_CLICK'],
  add_unsubscribe_tag: false,
  unsubscribe_text: '',
  auto_adjust_warmup: false,
  stop_lead_settings: 'REPLY_TO_AN_EMAIL',
  linkedin_settings: {},
  send_as_plain_text: true,
  force_plain_text: true,
  domain_level_rate_limit: false,
  follow_up_percentage: 100,
  enable_ai_esp_matching: false,
  ai_categorisation_options: [{ id: 6, label: 'Out Of Office' }],
  auto_pause_domain_leads_on_reply: false,
  ignore_ss_mailbox_sending_limit: false,
  out_of_office_detection_settings: {
    ignoreOOOasReply: true,
    autoCategorizeOOO: true,
    autoReactivateOOO: false,
    reactivateOOOwithDelay: null,
  },
  bounce_autopause_threshold: null,
  send_to_one_esp_type: null,
}

const SETTINGS_URL = 'https://server.smartlead.ai/api/email-campaigns/4024214/settings'
const PATCH_URL = 'https://sl-fe-v2.smartlead.ai/api/v1/campaigns/4024214'

interface Call {
  url: string
  method: string
  auth: string
  body: unknown
}

let calls: Call[]
/** Settings the fake Smartlead returns; a PATCH applies `onPatch` to them. */
let stored: Record<string, unknown>
let onPatch: (body: Record<string, unknown>) => void
let getStatus: number

beforeEach(() => {
  process.env.SMARTLEAD_JWT = 'test-jwt'
  calls = []
  stored = structuredClone(SETTINGS)
  getStatus = 200
  onPatch = (body) => {
    stored.max_leads_per_day = Number(body.max_leads_per_day)
  }
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({
      url,
      method: String(init.method),
      auth: (init.headers as Record<string, string>).Authorization,
      body,
    })
    if (init.method === 'PATCH') {
      onPatch(body)
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: { id: 4024214 } }) }
    }
    return {
      ok: getStatus === 200,
      status: getStatus,
      text: async () =>
        getStatus === 200 ? JSON.stringify({ data: stored }) : '<html>503 Service Temporarily Unavailable</html>',
    }
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

const get = (id: string) =>
  ({ method: 'GET', headers: {}, query: { id }, body: {} }) as unknown as VercelRequest
const post = (body: unknown) =>
  ({ method: 'POST', headers: {}, query: {}, body }) as unknown as VercelRequest

describe('campaign settings read', () => {
  it('reads max leads and the plain-text/tracking flags from one settings call', async () => {
    const { res, captured } = fakeRes()
    await readHandler(get('4024214'), res)

    expect(calls).toEqual([{ url: SETTINGS_URL, method: 'GET', auth: 'Bearer test-jwt', body: undefined }])
    expect(captured.status).toBe(200)
    expect(captured.body).toEqual({
      id: 4024214,
      max_leads_per_day: 15000,
      send_as_plain_text: true,
      force_plain_text: true,
      track_settings: ['DONT_EMAIL_OPEN', 'DONT_LINK_CLICK'],
    })
  })

  it("relays Smartlead's status when the read fails", async () => {
    getStatus = 503
    const { res, captured } = fakeRes()
    await readHandler(get('4024214'), res)

    expect(captured.status).toBe(503)
    expect(String(captured.body.error)).toContain('503')
  })
})

describe('max leads/day update', () => {
  it('sends only max_leads_per_day, as a string, to the v2 campaign PATCH', async () => {
    const { res, captured } = fakeRes()
    await updateHandler(post({ id: 4024214, maxLeadsPerDay: 250 }), res)

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch).toEqual({
      url: PATCH_URL,
      method: 'PATCH',
      auth: 'Bearer test-jwt',
      body: { max_leads_per_day: '250' },
    })
    // Read, write, then read back to confirm.
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PATCH', 'GET'])
    expect(captured.status).toBe(200)
    expect(captured.body).toEqual({ success: true, id: 4024214, max_leads_per_day: 250 })
  })

  it('fails loudly if the write reset any other setting', async () => {
    onPatch = (body) => {
      stored.max_leads_per_day = Number(body.max_leads_per_day)
      stored.scheduler_cron_value = { tz: 'UTC', days: [1, 2, 3, 4, 5], endHour: '18:00', startHour: '09:00' }
      stored.min_time_btwn_emails = 10
    }
    const { res, captured } = fakeRes()
    await updateHandler(post({ id: 4024214, maxLeadsPerDay: 250 }), res)

    expect(captured.status).toBe(502)
    expect(String(captured.body.error)).toContain('scheduler_cron_value, min_time_btwn_emails')
  })

  it('fails if Smartlead accepts the write but the value did not change', async () => {
    onPatch = () => {}
    const { res, captured } = fakeRes()
    await updateHandler(post({ id: 4024214, maxLeadsPerDay: 250 }), res)

    expect(captured.status).toBe(502)
    expect(String(captured.body.error)).toContain('still reports max leads/day of 15000')
  })

  it('treats a re-ordered but identical setting as unchanged', async () => {
    onPatch = (body) => {
      stored.max_leads_per_day = Number(body.max_leads_per_day)
      stored.scheduler_cron_value = { startHour: '09:10', endHour: '17:00', days: [0, 1, 2, 3, 4, 5, 6], tz: 'America/Chicago' }
    }
    const { res, captured } = fakeRes()
    await updateHandler(post({ id: 4024214, maxLeadsPerDay: 250 }), res)

    expect(captured.status).toBe(200)
  })

  it('rejects a bad value before touching Smartlead', async () => {
    const { res, captured } = fakeRes()
    await updateHandler(post({ id: 4024214, maxLeadsPerDay: -5 }), res)

    expect(captured.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})
