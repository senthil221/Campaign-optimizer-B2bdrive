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

/** Raw shape the direct Smartlead endpoint returns, for the fallback path. */
const rawAccount = {
  id: 42,
  from_email: 'sender@example.com',
  from_name: 'Sender',
  type: 'GMAIL',
  message_per_day: 25,
  daily_sent_count: 3,
  time_to_wait_in_mins: 15,
  is_in_use: true,
  email_warmup_details: { status: 'ACTIVE', warmup_reputation: 99 },
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

  // A second Vercel project pointed at an empty or unreachable database must
  // still show inboxes: the direct Smartlead read needs no database at all.
  it('falls back to reading Smartlead directly when the initial sync fails', async () => {
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
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).startsWith('/api/account-snapshot')) {
        // GET returns an empty snapshot; the POST that would build it fails.
        return Promise.resolve(response({ accounts: [], status: emptyStatus }))
      }
      return Promise.resolve(
        response({ email_accounts: [rawAccount] }),
      )
    })
    // The sync POST is the call that fails on a broken database.
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(response({ accounts: [], status: emptyStatus })),
    )
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(response({ error: 'connect ECONNREFUSED' }, 500)),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { fetchEmailAccounts } = await import('./smartlead')

    const accounts = await fetchEmailAccounts('')
    expect(accounts).toHaveLength(1)
    expect(accounts[0].fromEmail).toBe('sender@example.com')
    // It reached the direct endpoint rather than throwing.
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).startsWith('/api/email-accounts'),
      ),
    ).toBe(true)
  })

  it('falls back when the sync reports it never completed', async () => {
    const stuckStatus = {
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
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      String(url).startsWith('/api/account-snapshot')
        ? Promise.resolve(response({ accounts: [], status: stuckStatus }))
        : Promise.resolve(response({ email_accounts: [rawAccount] })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { fetchEmailAccounts } = await import('./smartlead')

    await expect(fetchEmailAccounts('')).resolves.toHaveLength(1)
  })
})
