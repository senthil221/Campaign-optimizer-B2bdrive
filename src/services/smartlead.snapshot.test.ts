import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

const compactAccount = {
  id: 42,
  fromEmail: 'sender@example.com',
  fromName: 'Sender',
  providerType: 'GMAIL',
  createdAt: null,
  messagePerDay: 25,
  dailySentCount: 3,
  warmupStatus: 'ACTIVE',
  warmupReputation: 99,
  connected: true,
  isInUse: true,
  dnsSpfVerified: true,
  dnsDkimVerified: true,
  dnsDmarcVerified: true,
  dnsLastVerifiedAt: null,
  tagIds: [1],
  tagNames: ['Pool A'],
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Smartlead account snapshot client', () => {
  it('loads the compact snapshot without crawling Smartlead pages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        accounts: [compactAccount],
        status: {
          enabled: true,
          ready: true,
          stale: false,
          syncing: false,
          phase: 'complete',
          offset: 0,
          fetched: 1,
          accountCount: 1,
          error: null,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { fetchEmailAccounts } = await import('./smartlead')

    await expect(fetchEmailAccounts('')).resolves.toEqual([compactAccount])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/account-snapshot')
  })

  it('completes an empty initial snapshot before returning data', async () => {
    const emptyStatus = {
      enabled: true,
      ready: false,
      stale: true,
      syncing: false,
      phase: 'active',
      offset: 0,
      fetched: 0,
      accountCount: 0,
      error: null,
    }
    const completeStatus = {
      ...emptyStatus,
      ready: true,
      stale: false,
      phase: 'complete',
      fetched: 1,
      accountCount: 1,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ accounts: [], status: emptyStatus }))
      .mockResolvedValueOnce(response({ status: completeStatus }))
      .mockResolvedValueOnce(
        response({ accounts: [compactAccount], status: completeStatus }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { fetchEmailAccounts } = await import('./smartlead')

    await expect(fetchEmailAccounts('')).resolves.toEqual([compactAccount])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  })
})
