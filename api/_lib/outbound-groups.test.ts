import { describe, expect, it } from 'vitest'
import { groupDomainsByCurrentLimit } from './outbound-groups.js'

function account(email: string, messagePerDay: unknown) {
  return { id: email, from_email: email, message_per_day: messagePerDay }
}

describe('groupDomainsByCurrentLimit', () => {
  it('buckets uniform domains by their existing limit', () => {
    const result = groupDomainsByCurrentLimit(
      [
        account('a@one.com', 9),
        account('b@one.com', 9),
        account('c@two.com', 20),
      ],
      ['one.com', 'two.com'],
    )

    expect(result.mixed).toEqual([])
    expect(result.unknown).toEqual([])
    expect(
      result.groups.map((group) => [group.messagePerDay, group.domains]),
    ).toEqual([
      [9, ['one.com']],
      [20, ['two.com']],
    ])
    expect(result.groups[0].accounts).toHaveLength(2)
  })

  it('merges separate domains that share the same limit', () => {
    const result = groupDomainsByCurrentLimit(
      [account('a@one.com', 9), account('b@two.com', 9)],
      ['one.com', 'two.com'],
    )

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].domains).toEqual(['one.com', 'two.com'])
    expect(result.groups[0].accounts).toHaveLength(2)
  })

  it('keeps every group\'s domain set disjoint', () => {
    const result = groupDomainsByCurrentLimit(
      [
        account('a@one.com', 9),
        account('b@two.com', 20),
        account('c@three.com', 9),
      ],
      ['one.com', 'two.com', 'three.com'],
    )

    const seen = new Set<string>()
    for (const group of result.groups) {
      for (const domain of group.domains) {
        expect(seen.has(domain)).toBe(false)
        seen.add(domain)
      }
    }
  })

  it('reports a domain whose own inboxes disagree instead of grouping it', () => {
    const result = groupDomainsByCurrentLimit(
      [
        account('a@mixed.com', 9),
        account('b@mixed.com', 20),
        account('c@clean.com', 30),
      ],
      ['mixed.com', 'clean.com'],
    )

    expect(result.mixed).toEqual(['mixed.com'])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].domains).toEqual(['clean.com'])
    // The mixed domain's inboxes must not leak into any group.
    expect(
      result.groups.flatMap((group) => group.accounts),
    ).toHaveLength(1)
  })

  it('reports a domain with an unusable current value', () => {
    const result = groupDomainsByCurrentLimit(
      [account('a@bad.com', null), account('b@bad.com', 9)],
      ['bad.com'],
    )

    expect(result.unknown).toEqual(['bad.com'])
    expect(result.groups).toEqual([])
  })

  // Number(null), Number(''), Number(false) all coerce to 0, and 0 is a real
  // limit meaning "paused". Coercing would write a genuine 0 to the inbox.
  it.each([[null], [undefined], [''], [false], [{}], [[]]])(
    'never coerces %p into a limit of 0',
    (value) => {
      const result = groupDomainsByCurrentLimit(
        [account('a@bad.com', value)],
        ['bad.com'],
      )

      expect(result.unknown).toEqual(['bad.com'])
      expect(result.groups).toEqual([])
    },
  )

  it('treats non-integer and out-of-range limits as unusable', () => {
    const result = groupDomainsByCurrentLimit(
      [
        account('a@frac.com', 9.5),
        account('b@huge.com', 5000),
        account('c@neg.com', -1),
      ],
      ['frac.com', 'huge.com', 'neg.com'],
    )

    expect(result.unknown).toEqual(['frac.com', 'huge.com', 'neg.com'])
    expect(result.groups).toEqual([])
  })

  it('ignores selected domains that have no inboxes', () => {
    const result = groupDomainsByCurrentLimit(
      [account('a@one.com', 9)],
      ['one.com', 'empty.com'],
    )

    expect(result.groups).toHaveLength(1)
    expect(result.mixed).toEqual([])
    expect(result.unknown).toEqual([])
  })

  it('matches inboxes to domains case-insensitively', () => {
    const result = groupDomainsByCurrentLimit(
      [account('A@One.com', 9)],
      ['one.com'],
    )

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].accounts).toHaveLength(1)
  })

  it('preserves a limit of zero rather than treating it as missing', () => {
    const result = groupDomainsByCurrentLimit(
      [account('a@paused.com', 0)],
      ['paused.com'],
    )

    expect(result.unknown).toEqual([])
    expect(result.groups.map((group) => group.messagePerDay)).toEqual([0])
  })
})
