import type { DomainManagementRow, EmailAccount } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export function domainFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  return at >= 0 ? normalized.slice(at + 1) : ''
}

export function buildDomainManagementRows(
  accounts: EmailAccount[],
): DomainManagementRow[] {
  const grouped = new Map<string, EmailAccount[]>()

  for (const account of accounts) {
    const domain = domainFromEmail(account.fromEmail)
    if (!domain) continue
    const current = grouped.get(domain)
    if (current) current.push(account)
    else grouped.set(domain, [account])
  }

  return Array.from(grouped, ([domain, domainAccounts]) => {
    const limits = Array.from(
      new Set(domainAccounts.map((account) => account.messagePerDay)),
    ).sort((a, b) => a - b)
    const tagNames = Array.from(
      new Set(domainAccounts.flatMap((account) => account.tagNames)),
    ).sort((a, b) => a.localeCompare(b))
    const createdTimestamps = domainAccounts
      .map((account) =>
        account.createdAt ? Date.parse(account.createdAt) : Number.NaN,
      )
      .filter(Number.isFinite)
    const earliestCreatedTimestamp =
      createdTimestamps.length > 0 ? Math.min(...createdTimestamps) : null

    return {
      domain,
      accounts: domainAccounts,
      accountCount: domainAccounts.length,
      connectedCount: domainAccounts.filter((account) => account.connected)
        .length,
      createdAt:
        earliestCreatedTimestamp === null
          ? null
          : new Date(earliestCreatedTimestamp).toISOString(),
      ageDays:
        earliestCreatedTimestamp === null
          ? null
          : Math.max(
              0,
              Math.floor((Date.now() - earliestCreatedTimestamp) / DAY_MS),
            ),
      totalDailyCapacity: domainAccounts.reduce(
        (sum, account) => sum + account.messagePerDay,
        0,
      ),
      dailyLimit: limits.length === 1 ? limits[0] : null,
      dailyLimitMin: limits[0] ?? 0,
      dailyLimitMax: limits[limits.length - 1] ?? 0,
      tagNames,
    }
  }).sort((a, b) => a.domain.localeCompare(b.domain))
}
