import type { DomainManagementRow, EmailAccount } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Smartlead reports a mailbox that has hit its provider's shared sending cap
 * with a "tenant threshold exceeded" error. Those inboxes keep looking healthy
 * (connected, warm, DNS valid) while silently failing to send, so the domain
 * table flags them separately from an ordinary disconnect.
 */
export function isTenantThresholdError(message: string): boolean {
  // Smartlead has phrased this several ways ("Tenant sending threshold has been
  // exceeded", "tenant threshold exceeded", "TenantThresholdExceeded"), so the
  // message is flattened to letters and matched on the three words that every
  // variant shares rather than on one exact wording.
  const letters = message.toLowerCase().replace(/[^a-z]+/g, ' ')
  return (
    letters.includes('tenant') &&
    letters.includes('threshold') &&
    letters.includes('exceed')
  )
}

/** Shared value across a set, or null when the members disagree. */
function sharedValue(values: Array<number | null>): {
  shared: number | null
  min: number
  max: number
} {
  const known = values.filter((value): value is number => value !== null)
  if (known.length === 0) return { shared: null, min: 0, max: 0 }
  const min = Math.min(...known)
  const max = Math.max(...known)
  // An inbox with no reported value can't be vouched for, so a partial set
  // counts as disagreement rather than silently speaking for the whole domain.
  const shared = min === max && known.length === values.length ? min : null
  return { shared, min, max }
}

export function domainFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  return at >= 0 ? normalized.slice(at + 1) : ''
}

export function isValidDomain(domain: string): boolean {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
    domain,
  )
}

export function buildDomainManagementRows(
  accounts: EmailAccount[],
): DomainManagementRow[] {
  const grouped = new Map<string, EmailAccount[]>()

  for (const account of accounts) {
    const domain = domainFromEmail(account.fromEmail)
    if (!isValidDomain(domain)) continue
    const current = grouped.get(domain)
    if (current) current.push(account)
    else grouped.set(domain, [account])
  }

  return Array.from(grouped, ([domain, domainAccounts]) => {
    const senderNameMap = new Map<
      string,
      { name: string; inboxCount: number }
    >()
    for (const account of domainAccounts) {
      const name = account.fromName.trim() || 'No sender name'
      const key = name.toLowerCase()
      const current = senderNameMap.get(key)
      if (current) current.inboxCount += 1
      else senderNameMap.set(key, { name, inboxCount: 1 })
    }
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
    const warmupEnabledCount = domainAccounts.filter((account) =>
      ['ACTIVE', 'ENABLED', 'RUNNING'].includes(account.warmupStatus.toUpperCase()),
    ).length
    const warmupState: DomainManagementRow['warmupState'] =
      warmupEnabledCount === domainAccounts.length
        ? 'enabled'
        : warmupEnabledCount === 0
          ? 'disabled'
          : 'mixed'

    const minWaits = sharedValue(
      domainAccounts.map((account) => account.minTimeBtwnEmails),
    )
    const warmupPerDays = sharedValue(
      domainAccounts.map((account) => account.warmupPerDay),
    )

    return {
      domain,
      providerTypes: Array.from(
        new Set(
          domainAccounts
            .map((account) => account.providerType)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
      accounts: domainAccounts,
      senderNames: Array.from(senderNameMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      accountCount: domainAccounts.length,
      connectedCount: domainAccounts.filter((account) => account.connected)
        .length,
      warmupEnabledCount,
      warmupState,
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
      dailyLimit: limits.length === 1 ? limits[0] : null,
      dailyLimitMin: limits[0] ?? 0,
      dailyLimitMax: limits[limits.length - 1] ?? 0,
      tagNames,
      minWait: minWaits.shared,
      minWaitMin: minWaits.min,
      minWaitMax: minWaits.max,
      warmupPerDay: warmupPerDays.shared,
      warmupSentCount: domainAccounts.reduce(
        (sum, account) => sum + (account.warmupSentCount ?? 0),
        0,
      ),
      tenantThresholdCount: domainAccounts.filter((account) =>
        isTenantThresholdError(account.errorMessage),
      ).length,
    }
  }).sort((a, b) => a.domain.localeCompare(b.domain))
}
