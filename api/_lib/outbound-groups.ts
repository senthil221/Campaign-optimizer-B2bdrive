// Splitting an outbound update so every inbox keeps its existing
// message_per_day. Smartlead's update_outbound takes ONE settings object per
// call, so preserving N distinct maxes means N calls.
//
// Groups are keyed by DOMAIN rather than by account: the upstream call receives
// both `accounts` and `domains`, and we do not control which one it keys off.
// Giving every group a disjoint domain set makes the outcome identical under
// either interpretation. A domain whose own inboxes disagree cannot be placed
// in exactly one group, so it is reported instead of guessed at.

export interface OutboundGroup {
  messagePerDay: number
  domains: string[]
  accounts: Record<string, unknown>[]
}

export interface OutboundGrouping {
  groups: OutboundGroup[]
  /** Selected domains whose inboxes have differing message_per_day values. */
  mixed: string[]
  /** Selected domains with at least one inbox missing a usable current value. */
  unknown: string[]
}

function domainFromEmail(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1) : ''
}

// Deliberately stricter than a bare Number() coercion: Number(null), Number('')
// and Number(false) are all 0, and 0 is a legitimate "paused" limit. Coercing a
// missing value would write a real 0 to the inbox and stop its sending.
function dailyLimit(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 1000 ? value : null
  }
  if (typeof value !== 'string' || value.trim() === '') return null
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 1000) {
    return null
  }
  return numberValue
}

export function groupDomainsByCurrentLimit(
  accounts: Record<string, unknown>[],
  domains: string[],
): OutboundGrouping {
  const byDomain = new Map<string, Record<string, unknown>[]>()
  for (const account of accounts) {
    const domain = domainFromEmail(account.from_email)
    const rows = byDomain.get(domain)
    if (rows) rows.push(account)
    else byDomain.set(domain, [account])
  }

  const mixed: string[] = []
  const unknown: string[] = []
  const byLimit = new Map<number, OutboundGroup>()

  for (const domain of domains) {
    const rows = byDomain.get(domain) ?? []
    if (rows.length === 0) continue

    const limits = new Set<number>()
    let missing = false
    for (const account of rows) {
      const limit = dailyLimit(account.message_per_day)
      if (limit === null) missing = true
      else limits.add(limit)
    }

    // A missing value is reported even when the rest of the domain agrees:
    // writing the agreed value would still be a guess for that one inbox.
    if (missing) {
      unknown.push(domain)
      continue
    }
    if (limits.size !== 1) {
      mixed.push(domain)
      continue
    }

    const messagePerDay = limits.values().next().value as number
    const group = byLimit.get(messagePerDay)
    if (group) {
      group.domains.push(domain)
      group.accounts.push(...rows)
    } else {
      byLimit.set(messagePerDay, {
        messagePerDay,
        domains: [domain],
        accounts: [...rows],
      })
    }
  }

  return {
    groups: Array.from(byLimit.values()).sort(
      (a, b) => a.messagePerDay - b.messagePerDay,
    ),
    mixed,
    unknown,
  }
}
