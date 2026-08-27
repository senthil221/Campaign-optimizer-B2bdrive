import { describe, expect, it } from 'vitest'
import type { EmailAccount } from '../types'
import {
  buildDomainManagementRows,
  isTenantThresholdError,
} from './domainManagement'

function account(id: number, domainIndex: number): EmailAccount {
  return {
    id,
    fromEmail: `sender-${id}@domain-${domainIndex}.example.com`,
    fromName: `Sender ${id % 8}`,
    providerType: id % 2 === 0 ? 'GMAIL' : 'OUTLOOK',
    createdAt: '2025-01-01T00:00:00.000Z',
    messagePerDay: 25,
    dailySentCount: id % 25,
    warmupStatus: 'ACTIVE',
    warmupReputation: 98,
    connected: id % 100 !== 0,
    isInUse: id % 3 !== 0,
    dnsSpfVerified: true,
    dnsDkimVerified: true,
    dnsDmarcVerified: true,
    dnsLastVerifiedAt: '2026-08-17T00:00:00.000Z',
    tagIds: [id % 10],
    tagNames: [`Pool ${id % 10}`],
    minTimeBtwnEmails: 15,
    warmupPerDay: 9,
    warmupSentCount: id % 40,
    warmupBlocked: false,
    errorMessage: '',
  }
}

describe('enterprise domain aggregation', () => {
  it('groups 50,000 compact inboxes into stable domain summaries', () => {
    const accounts = Array.from({ length: 50_000 }, (_, index) =>
      account(index + 1, index % 500),
    )

    const rows = buildDomainManagementRows(accounts)

    expect(rows).toHaveLength(500)
    expect(rows.every((row) => row.accountCount === 100)).toBe(true)
    expect(rows.every((row) => row.dailyLimit === 25)).toBe(true)
    expect(rows.reduce((sum, row) => sum + row.accountCount, 0)).toBe(50_000)
    expect(rows[0].accounts[0]).not.toHaveProperty('rawAccount')
  })
})

describe('tenant threshold detection', () => {
  it('matches every wording Smartlead has used', () => {
    for (const message of [
      'tenant threshold exceeded',
      'Tenant sending threshold has been exceeded',
      'TenantThresholdExceeded',
      '550 5.7.708 Tenant threshold exceeded, please try again later',
    ]) {
      expect(isTenantThresholdError(message)).toBe(true)
    }
  })

  it('ignores unrelated errors and empty messages', () => {
    for (const message of [
      '',
      'Invalid credentials',
      'Daily sending limit exceeded',
      'Mailbox threshold warning',
    ]) {
      expect(isTenantThresholdError(message)).toBe(false)
    }
  })
})

describe('per-domain rollups', () => {
  it('reports a shared value, and null when inboxes disagree or go unreported', () => {
    const base = account(1, 0)
    const rows = buildDomainManagementRows([
      { ...base, id: 1, fromEmail: 'a@same.example.com' },
      { ...base, id: 2, fromEmail: 'b@same.example.com' },
      { ...base, id: 3, fromEmail: 'a@mixed.example.com', minTimeBtwnEmails: 20 },
      { ...base, id: 4, fromEmail: 'b@mixed.example.com', minTimeBtwnEmails: 40 },
      // An inbox with no reported wait can't speak for the domain.
      { ...base, id: 5, fromEmail: 'a@partial.example.com' },
      { ...base, id: 6, fromEmail: 'b@partial.example.com', minTimeBtwnEmails: null },
    ])
    const byDomain = new Map(rows.map((row) => [row.domain, row]))

    expect(byDomain.get('same.example.com')?.minWait).toBe(15)
    expect(byDomain.get('mixed.example.com')?.minWait).toBeNull()
    expect(byDomain.get('mixed.example.com')?.minWaitMin).toBe(20)
    expect(byDomain.get('mixed.example.com')?.minWaitMax).toBe(40)
    expect(byDomain.get('partial.example.com')?.minWait).toBeNull()
  })

  it('sums warmup sends and counts tenant-capped inboxes per domain', () => {
    const base = account(1, 0)
    const [row] = buildDomainManagementRows([
      { ...base, id: 1, fromEmail: 'a@acme.example.com', warmupSentCount: 30 },
      { ...base, id: 2, fromEmail: 'b@acme.example.com', warmupSentCount: 12 },
      {
        ...base,
        id: 3,
        fromEmail: 'c@acme.example.com',
        warmupSentCount: null,
        errorMessage: 'Tenant sending threshold has been exceeded',
      },
    ])

    expect(row.warmupSentCount).toBe(42)
    expect(row.tenantThresholdCount).toBe(1)
  })
})
