import type { EmailAccount, TagVolume } from '../types'

/**
 * Group normalized email accounts by tag and compute sending volume per tag.
 * An account carrying multiple tags contributes to each of its tags.
 * Accounts with no tag are grouped under a synthetic "Untagged" bucket.
 */
export function buildTagVolumes(accounts: EmailAccount[]): TagVolume[] {
  interface Acc {
    tagId: number | null
    tagName: string
    accountCount: number
    totalDailyVolume: number
    usedToday: number
    disconnects: number
    reputationSum: number
    reputationCount: number
  }

  const map = new Map<string, Acc>()

  const ensure = (tagId: number | null, tagName: string): Acc => {
    let entry = map.get(tagName)
    if (!entry) {
      entry = {
        tagId,
        tagName,
        accountCount: 0,
        totalDailyVolume: 0,
        usedToday: 0,
        disconnects: 0,
        reputationSum: 0,
        reputationCount: 0,
      }
      map.set(tagName, entry)
    }
    return entry
  }

  for (const account of accounts) {
    const pairs: Array<{ id: number | null; name: string }> = []
    if (account.tagNames.length === 0) {
      pairs.push({ id: null, name: 'Untagged' })
    } else {
      account.tagNames.forEach((name, idx) => {
        pairs.push({ id: account.tagIds[idx] ?? null, name })
      })
    }

    for (const { id, name } of pairs) {
      const entry = ensure(id, name)
      entry.accountCount += 1

      // A disconnected mailbox can't send, so it adds no deliverable volume.
      // It still counts toward the account total and the disconnect tally.
      if (!account.connected) {
        entry.disconnects += 1
        continue
      }

      entry.totalDailyVolume += account.messagePerDay
      entry.usedToday += account.dailySentCount
      if (account.warmupReputation > 0) {
        entry.reputationSum += account.warmupReputation
        entry.reputationCount += 1
      }
    }
  }

  return Array.from(map.values())
    .map((e) => ({
      tagId: e.tagId,
      tagName: e.tagName,
      accountCount: e.accountCount,
      totalDailyVolume: e.totalDailyVolume,
      usedToday: e.usedToday,
      remainingToday: e.totalDailyVolume - e.usedToday,
      disconnects: e.disconnects,
      avgWarmupReputation:
        e.reputationCount > 0
          ? Math.round((e.reputationSum / e.reputationCount) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.totalDailyVolume - a.totalDailyVolume)
}
