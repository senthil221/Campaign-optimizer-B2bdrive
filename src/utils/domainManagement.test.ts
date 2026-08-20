import { describe, expect, it } from 'vitest'
import type { EmailAccount } from '../types'
import { buildDomainManagementRows } from './domainManagement'

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
