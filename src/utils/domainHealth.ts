import type {
  DomainBounceRisk,
  DomainHealthMetric,
  DomainHealthRow,
  EmailAccount,
} from '../types'

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : ''
}

export function buildDomainHealthRows(
  metrics: DomainHealthMetric[],
  accounts: EmailAccount[],
  bounceRisks: DomainBounceRisk[] = [],
): DomainHealthRow[] {
  const metricMap = new Map<
    string,
    { sent: number; replied: number; bounced: number }
  >()
  for (const metric of metrics) {
    const domain = metric.domain.trim().toLowerCase()
    if (!domain) continue
    const current = metricMap.get(domain) ?? { sent: 0, replied: 0, bounced: 0 }
    current.sent += metric.sent
    current.replied += metric.replied
    current.bounced += metric.bounced
    metricMap.set(domain, current)
  }

  const accountMap = new Map<
    string,
    {
      count: number
      messagePerDay: number
      providerTypes: Set<string>
      tagNames: Set<string>
      reputationSum: number
      reputationCount: number
      spfVerified: boolean
      dkimVerified: boolean
      dmarcVerified: boolean
    }
  >()
  for (const account of accounts) {
    const domain = emailDomain(account.fromEmail)
    if (!domain) continue
    const current = accountMap.get(domain) ?? {
      count: 0,
      messagePerDay: 0,
      providerTypes: new Set<string>(),
      tagNames: new Set<string>(),
      reputationSum: 0,
      reputationCount: 0,
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
    }
    current.count += 1
    if (account.providerType) current.providerTypes.add(account.providerType)
    if (account.connected) current.messagePerDay += account.messagePerDay
    for (const tagName of account.tagNames) {
      const normalizedTag = tagName.trim()
      if (normalizedTag) current.tagNames.add(normalizedTag)
    }
    if (account.warmupReputation > 0) {
      current.reputationSum += account.warmupReputation
      current.reputationCount += 1
    }
    current.spfVerified &&= account.dnsSpfVerified
    current.dkimVerified &&= account.dnsDkimVerified
    current.dmarcVerified &&= account.dnsDmarcVerified
    accountMap.set(domain, current)
  }

  const riskMap = new Map(
    bounceRisks.map((risk) => [risk.domain.trim().toLowerCase(), risk]),
  )
  const domains = new Set([
    ...metricMap.keys(),
    ...accountMap.keys(),
    ...riskMap.keys(),
  ])
  return Array.from(domains)
    .map((domain): DomainHealthRow => {
      const metric = metricMap.get(domain) ?? { sent: 0, replied: 0, bounced: 0 }
      const account = accountMap.get(domain)
      const spfVerified = account?.spfVerified ?? false
      const dkimVerified = account?.dkimVerified ?? false
      const dmarcVerified = account?.dmarcVerified ?? false
      const missingDns = [
        !spfVerified ? 'SPF' : '',
        !dkimVerified ? 'DKIM' : '',
        !dmarcVerified ? 'DMARC' : '',
      ].filter(Boolean)
      return {
        domain,
        sent: metric.sent,
        replied: metric.replied,
        bounced: metric.bounced,
        replyRate: metric.sent > 0 ? (metric.replied / metric.sent) * 100 : 0,
        bounceRate: metric.sent > 0 ? (metric.bounced / metric.sent) * 100 : 0,
        providerTypes: Array.from(account?.providerTypes ?? []).sort((a, b) =>
          a.localeCompare(b),
        ),
        tagNames: Array.from(account?.tagNames ?? []).sort((a, b) =>
          a.localeCompare(b),
        ),
        accountCount: account?.count ?? 0,
        messagePerDay: account?.messagePerDay ?? 0,
        avgWarmupReputation:
          account && account.reputationCount > 0
            ? Math.round(
                (account.reputationSum / account.reputationCount) * 10,
              ) / 10
            : null,
        spfVerified,
        dkimVerified,
        dmarcVerified,
        dnsValidated: missingDns.length === 0,
        missingDns,
        inboxRisk: riskMap.get(domain) ?? null,
      }
    })
    .sort(
      (a, b) =>
        b.bounceRate - a.bounceRate ||
        b.sent - a.sent ||
        a.domain.localeCompare(b.domain),
    )
}
