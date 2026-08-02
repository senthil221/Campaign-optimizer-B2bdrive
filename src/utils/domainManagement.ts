import type { DomainManagementRow, EmailAccount } from '../types'

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

    return {
      domain,
      accounts: domainAccounts,
      accountCount: domainAccounts.length,
      connectedCount: domainAccounts.filter((account) => account.connected)
        .length,
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
