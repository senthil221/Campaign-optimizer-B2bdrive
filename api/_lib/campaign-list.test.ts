import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import handler from '../campaign-list.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('campaign list proxy', () => {
  it("requests exactly what Smartlead's own UI requests", async () => {
    process.env.SMARTLEAD_JWT = 'test-jwt'
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return { status: 200, text: async () => '{"data":{"results":[]}}' }
    })
    const res = {
      status() {
        return this
      },
      setHeader() {},
      send() {
        return this
      },
    } as unknown as VercelResponse

    await handler({ headers: {}, query: { offset: '25' } } as unknown as VercelRequest, res)

    expect(urls).toEqual([
      'https://server.smartlead.ai/api/email-campaigns/get-all-campaigns?offset=25&limit=25&statusNot=DELETED&parentCampaignId=null',
    ])
  })
})
