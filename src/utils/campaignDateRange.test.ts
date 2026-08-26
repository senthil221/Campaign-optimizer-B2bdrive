import { describe, expect, it } from 'vitest'
import { formatCreated, istDate, withinRange } from './campaignDateRange'

// 2026-08-27 09:00 IST. Chosen so the UTC instant (03:30Z) and the IST day
// differ from each other, which is where a timezone slip would show up.
const NOW = new Date('2026-08-27T03:30:00.000Z')

describe('campaign creation-date ranges', () => {
  it('lets everything through on Lifetime, including undated campaigns', () => {
    expect(withinRange(null, 'lifetime', NOW)).toBe(true)
    expect(withinRange('2020-01-01T00:00:00.000Z', 'lifetime', NOW)).toBe(true)
    expect(withinRange('not a date', 'lifetime', NOW)).toBe(true)
  })

  it('matches Today against the IST calendar day, not UTC', () => {
    // 23:00 UTC on the 26th is already the 27th in IST (+5:30).
    expect(withinRange('2026-08-26T23:00:00.000Z', 'today', NOW)).toBe(true)
    // 18:00 UTC on the 26th is still the 26th in IST.
    expect(withinRange('2026-08-26T18:00:00.000Z', 'today', NOW)).toBe(false)
    expect(withinRange('2026-08-27T03:30:00.000Z', 'today', NOW)).toBe(true)
  })

  it('covers today plus the two days before it on 3D', () => {
    expect(withinRange('2026-08-27T06:00:00.000Z', '3d', NOW)).toBe(true)
    expect(withinRange('2026-08-26T06:00:00.000Z', '3d', NOW)).toBe(true)
    expect(withinRange('2026-08-25T06:00:00.000Z', '3d', NOW)).toBe(true)
    // The fourth day back falls outside the window.
    expect(withinRange('2026-08-24T06:00:00.000Z', '3d', NOW)).toBe(false)
  })

  it('excludes campaigns with a missing or unparseable creation date', () => {
    for (const range of ['today', '3d'] as const) {
      expect(withinRange(null, range, NOW)).toBe(false)
      expect(withinRange('', range, NOW)).toBe(false)
      expect(withinRange('not a date', range, NOW)).toBe(false)
    }
  })

  it('reports the IST calendar day for an instant', () => {
    expect(istDate(new Date('2026-08-26T23:00:00.000Z'))).toBe('2026-08-27')
    expect(istDate(new Date('2026-08-26T18:00:00.000Z'))).toBe('2026-08-26')
  })
})

describe('creation-date formatting', () => {
  it('formats a real date and falls back to an em dash otherwise', () => {
    expect(formatCreated('2026-08-26T23:00:00.000Z')).toContain('2026')
    expect(formatCreated(null)).toBe('—')
    expect(formatCreated('not a date')).toBe('—')
  })
})
