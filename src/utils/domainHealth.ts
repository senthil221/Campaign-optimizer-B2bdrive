import type {
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
      reputationSum: 0,
      reputationCount: 0,
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
    }
    current.count += 1
    if (account.warmupReputation > 0) {
      current.reputationSum += account.warmupReputation
      current.reputationCount += 1
    }
    current.spfVerified &&= account.dnsSpfVerified
    current.dkimVerified &&= account.dnsDkimVerified
    current.dmarcVerified &&= account.dnsDmarcVerified
    accountMap.set(domain, current)
  }

  const domains = new Set([...metricMap.keys(), ...accountMap.keys()])
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
        accountCount: account?.count ?? 0,
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
      }
    })
    .sort(
      (a, b) =>
        b.bounceRate - a.bounceRate ||
        b.sent - a.sent ||
        a.domain.localeCompare(b.domain),
    )
}
