import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCampaignList } from './smartlead'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A fake campaign list that honours offset but caps every page at `cap`. */
function stubCappedList(total: number, cap: number) {
  const offsets: number[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    const offset = Number(new URL(url, 'http://x').searchParams.get('offset'))
    offsets.push(offset)
    const rows = Array.from(
      { length: Math.max(0, Math.min(cap, total - offset)) },
      (_, i) => ({ id: offset + i + 1, name: `C${offset + i + 1}`, status: 'ACTIVE' }),
    )
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(rows),
    }
  })
  return offsets
}

describe('campaign list paging', () => {
  it('collects every campaign when Smartlead caps pages below our limit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const offsets = stubCappedList(60, 25)

    const { entries } = await fetchCampaignList('jwt')

    expect(entries.map((e) => e.id)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 1),
    )
    // Offsets follow what arrived (0, 25, 50), not a fixed stride of 100.
    expect(offsets.slice(0, 3)).toEqual([0, 25, 50])
    vi.useRealTimers()
  })

  it('stops on the empty page after the last campaign', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const offsets = stubCappedList(3, 100)

    const { entries } = await fetchCampaignList('jwt')

    expect(entries).toHaveLength(3)
    expect(offsets).toEqual([0, 3])
    vi.useRealTimers()
  })
})

describe('campaign list shape changes', () => {
  function stubBody(body: unknown) {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(body),
    }))
  }

  it('reports the keys and body when no campaign array is recognised', async () => {
    stubBody({ ok: true, data: { rows: [{ id: 1 }] } })
    await expect(fetchCampaignList('jwt')).rejects.toThrow(
      /no campaign array \(top-level keys: ok, data\)\. Response: \{"ok":true/,
    )
  })

  it('reports an empty list rather than silently returning nothing', async () => {
    stubBody({ campaigns: [] })
    await expect(fetchCampaignList('jwt')).rejects.toThrow(
      /empty campaign list \(top-level keys: campaigns\)/,
    )
  })
})
