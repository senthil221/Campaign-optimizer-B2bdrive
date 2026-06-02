import type {
  AlertLevel,
  Campaign,
  CampaignComputed,
  CampaignTagMap,
  EmailAccount,
  TagCapacity,
} from '../types'

// ---------------------------------------------------------------------------
// Small safe helpers
// ---------------------------------------------------------------------------

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return numerator / denominator
}

// ---------------------------------------------------------------------------
// Tag capacity aggregation
// ---------------------------------------------------------------------------

/**
 * Group normalized email accounts by tag and compute capacity stats per tag.
 * An account that carries multiple tags contributes to each of its tags.
 * Accounts with no tag are grouped under a synthetic "Untagged" bucket.
 */
export function buildTagCapacities(accounts: EmailAccount[]): TagCapacity[] {
  interface Acc {
    tagId: number | null
    tagName: string
    accountCount: number
    totalDailyCapacity: number
    usedToday: number
    reputationSum: number
    reputationCount: number
  }

  const map = new Map<string, Acc>()

  const ensure = (tagId: number | null, tagName: string): Acc => {
    const key = tagName
    let entry = map.get(key)
    if (!entry) {
      entry = {
        tagId,
        tagName,
        accountCount: 0,
        totalDailyCapacity: 0,
        usedToday: 0,
        reputationSum: 0,
        reputationCount: 0,
      }
      map.set(key, entry)
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
      entry.totalDailyCapacity += account.messagePerDay
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
      totalDailyCapacity: e.totalDailyCapacity,
      usedToday: e.usedToday,
      remainingToday: e.totalDailyCapacity - e.usedToday,
      avgWarmupReputation:
        e.reputationCount > 0
          ? Math.round((e.reputationSum / e.reputationCount) * 10) / 10
          : 0,
    }))
    .sort((a, b) => a.tagName.localeCompare(b.tagName))
}

// ---------------------------------------------------------------------------
// Campaign depletion calculations
// ---------------------------------------------------------------------------

export function progressPercent(campaign: Campaign): number {
  const pct = safeDivide(campaign.leadStats.completed, campaign.leadStats.total) * 100
  return Math.round(pct * 10) / 10
}

export function remainingEmailDemand(
  campaign: Campaign,
  emailsPerLead: number,
): number {
  return Math.max(0, campaign.leadStats.notStarted) * emailsPerLead
}

/**
 * Resolve the tag name assigned to a campaign.
 * Priority: manual mapping (campaign_id -> tag_name).
 */
export function resolveTagName(
  campaign: Campaign,
  tagMap: CampaignTagMap,
): string | null {
  const mapped = tagMap[String(campaign.campaignId)]
  return mapped && mapped.trim() ? mapped.trim() : null
}

function findTag(tagName: string | null, tags: TagCapacity[]): TagCapacity | null {
  if (!tagName) return null
  return (
    tags.find((t) => t.tagName.toLowerCase() === tagName.toLowerCase()) ?? null
  )
}

function isActiveStatus(status: string): boolean {
  const s = (status || '').toUpperCase()
  // Paused / stopped / completed campaigns do not consume shared capacity.
  return !['PAUSED', 'STOPPED', 'COMPLETED', 'DRAFTED'].includes(s)
}

/**
 * Build a map of tagName -> total remaining email demand across ALL active
 * campaigns assigned to that tag. This is the basis for shared_tag_days_left.
 */
export function buildTagDemandMap(
  campaigns: Campaign[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
): Map<string, number> {
  const demand = new Map<string, number>()
  for (const campaign of campaigns) {
    const tagName = resolveTagName(campaign, tagMap)
    if (!tagName) continue
    if (!isActiveStatus(campaign.status)) continue
    const key = tagName.toLowerCase()
    const prev = demand.get(key) ?? 0
    demand.set(key, prev + remainingEmailDemand(campaign, emailsPerLead))
  }
  return demand
}

export function classifyAlert(args: {
  progress: number
  notStarted: number
  tag: TagCapacity | null
  sharedTagDaysLeft: number | null
}): { level: AlertLevel; reason: string } {
  const { progress, notStarted, tag, sharedTagDaysLeft } = args

  if (notStarted <= 0) {
    return {
      level: 'ended',
      reason: 'No leads left to send (notStarted = 0). Upload more leads.',
    }
  }

  if (!tag || tag.totalDailyCapacity <= 0) {
    return {
      level: 'no_capacity',
      reason: !tag
        ? 'No tag mapped to this campaign — cannot estimate depletion.'
        : 'Mapped tag has 0 daily sending capacity.',
    }
  }

  const days = sharedTagDaysLeft

  if (progress >= 80 || (days !== null && days <= 2)) {
    return {
      level: 'critical',
      reason:
        progress >= 80
          ? `Progress is ${progress}% — upload leads now.`
          : `Shared tag will run dry in ~${days} day(s).`,
    }
  }

  if (progress >= 70 || (days !== null && days <= 3)) {
    return {
      level: 'upload_soon',
      reason:
        progress >= 70
          ? `Progress is ${progress}% — plan a lead upload soon.`
          : `Shared tag has ~${days} day(s) of leads left.`,
    }
  }

  return {
    level: 'healthy',
    reason: `Healthy — ${progress}% complete, ~${days ?? '∞'} day(s) of shared capacity left.`,
  }
}

/**
 * Compute everything the UI needs for a single campaign.
 */
export function computeCampaign(
  campaign: Campaign,
  tags: TagCapacity[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
  tagDemandMap: Map<string, number>,
): CampaignComputed {
  const tagName = resolveTagName(campaign, tagMap)
  const tag = findTag(tagName, tags)
  const progress = progressPercent(campaign)
  const demand = remainingEmailDemand(campaign, emailsPerLead)

  let campaignDaysLeft: number | null = null
  let sharedTagDaysLeft: number | null = null

  if (tag && tag.totalDailyCapacity > 0) {
    campaignDaysLeft = Math.ceil(safeDivide(demand, tag.totalDailyCapacity))

    const sharedDemand =
      tagName !== null
        ? tagDemandMap.get(tagName.toLowerCase()) ?? demand
        : demand
    sharedTagDaysLeft = Math.ceil(
      safeDivide(sharedDemand, tag.totalDailyCapacity),
    )
  }

  const { level, reason } = classifyAlert({
    progress,
    notStarted: campaign.leadStats.notStarted,
    tag,
    sharedTagDaysLeft,
  })

  return {
    campaign,
    tagName,
    tag,
    progressPercent: progress,
    remainingEmailDemand: demand,
    campaignDaysLeft,
    sharedTagDaysLeft,
    alertLevel: level,
    alertReason: reason,
  }
}

export function computeAllCampaigns(
  campaigns: Campaign[],
  tags: TagCapacity[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
): CampaignComputed[] {
  const tagDemandMap = buildTagDemandMap(campaigns, tagMap, emailsPerLead)
  return campaigns.map((c) =>
    computeCampaign(c, tags, tagMap, emailsPerLead, tagDemandMap),
  )
}
