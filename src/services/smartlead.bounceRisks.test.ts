import { describe, expect, it } from 'vitest'
import type { DomainBounceRisk } from '../types'
import { mergeDomainBounceRisks } from './smartlead'

function risk(
  domain: string,
  total: number,
  inboxes: string[],
  latestAt: string,
  categories: DomainBounceRisk['categories'],
): DomainBounceRisk {
  return {
    domain,
    total,
    affectedInboxes: inboxes.length,
    latestAt,
    inboxes,
    categories,
    samples: inboxes.map((senderEmail) => ({
      senderEmail,
      category: categories[0].category,
      label: categories[0].label,
      occurredAt: latestAt,
      diagnostic: 'x',
      senderBounce: false,
    })),
  }
}

const TENANT = { category: 'tenant_threshold' as const, label: 'Tenant threshold exceeded' }
const SPAM = { category: 'spam_rejected' as const, label: 'Spam / reputation rejected' }

describe('merging per-campaign bounce risks', () => {
  it('adds counts and unions inboxes for a domain seen in several campaigns', () => {
    const merged = mergeDomainBounceRisks([
      [risk('acme.com', 3, ['a@acme.com', 'b@acme.com'], '2026-09-24T00:00:00Z', [{ ...TENANT, count: 3 }])],
      [
        risk('acme.com', 2, ['b@acme.com', 'c@acme.com'], '2026-09-26T00:00:00Z', [
          { ...TENANT, count: 1 },
          { ...SPAM, count: 1 },
        ]),
        risk('other.com', 9, ['z@other.com'], '2026-09-20T00:00:00Z', [{ ...SPAM, count: 9 }]),
      ],
    ])

    expect(merged.map((r) => r.domain)).toEqual(['other.com', 'acme.com'])
    const acme = merged[1]
    expect(acme.total).toBe(5)
    expect(acme.inboxes).toEqual(['a@acme.com', 'b@acme.com', 'c@acme.com'])
    expect(acme.affectedInboxes).toBe(3)
    expect(acme.latestAt).toBe('2026-09-26T00:00:00Z')
    expect(acme.categories).toEqual([
      { ...TENANT, count: 4 },
      { ...SPAM, count: 1 },
    ])
    // Newest samples first, capped at five.
    expect(acme.samples.map((s) => s.occurredAt)[0]).toBe('2026-09-26T00:00:00Z')
    expect(acme.samples.length).toBeLessThanOrEqual(5)
  })

  it('returns nothing when no campaign had risks', () => {
    expect(mergeDomainBounceRisks([[], []])).toEqual([])
  })
})
