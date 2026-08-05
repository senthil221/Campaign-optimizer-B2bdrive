import type {
  BulkSyncCampaignTarget,
  BulkSyncPlan,
  BulkSyncTagPool,
  Campaign,
  EmailAccount,
} from '../types'

export interface BulkSyncSelection {
  plan: BulkSyncPlan
  activeCampaigns: number
  skipped: {
    noMatchingTag: number
    ambiguousTag: number
    emptyPool: number
  }
}

function tagKey(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Build the safe, automatic portion of a bulk sync.
 *
 * A campaign is included only when exactly one of its campaign tags has an
 * exact, case-insensitive match to an email-account tag. Explicitly
 * disconnected accounts are excluded by the normalized `connected` flag.
 */
export function buildBulkSyncSelection(
  campaigns: Campaign[],
  accounts: EmailAccount[],
): BulkSyncSelection {
  const emailTags = new Map<
    string,
    { tagName: string; connectedAccountIds: Set<number> }
  >()

  for (const account of accounts) {
    for (const rawName of account.tagNames) {
      const key = tagKey(rawName)
      if (!key) continue
      let entry = emailTags.get(key)
      if (!entry) {
        entry = { tagName: rawName.trim(), connectedAccountIds: new Set() }
        emailTags.set(key, entry)
      }
      if (account.connected && account.id > 0) {
        entry.connectedAccountIds.add(account.id)
      }
    }
  }

  const targets: BulkSyncCampaignTarget[] = []
  const usedPoolKeys = new Set<string>()
  const skipped = { noMatchingTag: 0, ambiguousTag: 0, emptyPool: 0 }
  const active = campaigns.filter(
    (campaign) => campaign.status.trim().toUpperCase() === 'ACTIVE',
  )

  for (const campaign of active) {
    const matches = new Map<string, { tagName: string; accountIds: Set<number> }>()
    for (const rawName of campaign.apiTags) {
      const key = tagKey(rawName)
      const pool = emailTags.get(key)
      if (pool) matches.set(key, { tagName: pool.tagName, accountIds: pool.connectedAccountIds })
    }

    if (matches.size === 0) {
      skipped.noMatchingTag++
      continue
    }
    if (matches.size > 1) {
      skipped.ambiguousTag++
      continue
    }

    const [key, pool] = matches.entries().next().value as [
      string,
      { tagName: string; accountIds: Set<number> },
    ]
    if (pool.accountIds.size === 0) {
      skipped.emptyPool++
      continue
    }

    usedPoolKeys.add(key)
    targets.push({
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      tagKey: key,
      tagName: pool.tagName,
    })
  }

  const pools: BulkSyncTagPool[] = Array.from(usedPoolKeys, (key) => {
    const pool = emailTags.get(key)!
    return {
      tagKey: key,
      tagName: pool.tagName,
      accountIds: Array.from(pool.connectedAccountIds).sort((a, b) => a - b),
    }
  })

  targets.sort((a, b) => a.campaignName.localeCompare(b.campaignName))
  pools.sort((a, b) => a.tagName.localeCompare(b.tagName))

  return {
    plan: { campaigns: targets, pools },
    activeCampaigns: active.length,
    skipped,
  }
}
