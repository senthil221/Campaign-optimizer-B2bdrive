import type {
  Campaign,
  CampaignComputed,
  CampaignStatus,
  CampaignTagMap,
  TagForecast,
  TagVolume,
} from '../types'

// ---------------------------------------------------------------------------
// Small safe helpers (shared across services + utils)
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
// Core campaign math
// ---------------------------------------------------------------------------

export function progressPercent(campaign: Campaign): number {
  const pct =
    safeDivide(campaign.leadStats.completed, campaign.leadStats.total) * 100
  return Math.round(pct * 10) / 10
}

export function remainingEmailDemand(
  campaign: Campaign,
  emailsPerLead: number,
): number {
  return Math.max(0, campaign.leadStats.notStarted) * emailsPerLead
}

/**
 * Resolve the tag name for a campaign.
 * Precedence: manual override (localStorage) → Smartlead's own campaign tag
 * (preferring one that matches an existing sending pool) → none.
 */
export function resolveTagName(
  campaign: Campaign,
  tagMap: CampaignTagMap,
  availableTags: string[] = [],
): string | null {
  const manual = tagMap[String(campaign.campaignId)]
  if (manual && manual.trim()) return manual.trim()

  const apiTags = campaign.apiTags ?? []
  if (apiTags.length > 0) {
    if (availableTags.length > 0) {
      const set = new Set(availableTags.map((t) => t.toLowerCase()))
      const match = apiTags.find((t) => set.has(t.toLowerCase()))
      return match ?? apiTags[0]
    }
    return apiTags[0]
  }
  return null
}

function findTag(tagName: string | null, tags: TagVolume[]): TagVolume | null {
  if (!tagName) return null
  return (
    tags.find((t) => t.tagName.toLowerCase() === tagName.toLowerCase()) ?? null
  )
}

/**
 * tagName(lower) -> total remaining email demand across ALL campaigns mapped
 * to that tag. Basis for shared_tag_days_left.
 */
export function buildTagDemandMap(
  campaigns: Campaign[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
  availableTags: string[] = [],
): Map<string, number> {
  const demand = new Map<string, number>()
  for (const campaign of campaigns) {
    const tagName = resolveTagName(campaign, tagMap, availableTags)
    if (!tagName) continue
    const key = tagName.toLowerCase()
    demand.set(key, (demand.get(key) ?? 0) + remainingEmailDemand(campaign, emailsPerLead))
  }
  return demand
}

// ---------------------------------------------------------------------------
// Status classification
// ---------------------------------------------------------------------------

export function classifyStatus(args: {
  notStarted: number
  tag: TagVolume | null
  sharedTagDaysLeft: number | null
}): { status: CampaignStatus; reason: string } {
  const { notStarted, tag, sharedTagDaysLeft } = args

  if (notStarted <= 0) {
    return { status: 'ended', reason: 'No leads left to send (notStarted = 0).' }
  }
  if (!tag) {
    return {
      status: 'unmapped',
      reason: 'No tag selected — pick a tag to forecast depletion.',
    }
  }
  if (tag.totalDailyVolume <= 0) {
    return {
      status: 'no_capacity',
      reason: 'Mapped tag has 0 daily sending volume.',
    }
  }
  const d = sharedTagDaysLeft
  if (d !== null && d <= 2) {
    return { status: 'critical', reason: `Shared tag runs dry in ~${d} day(s).` }
  }
  if (d !== null && d <= 4) {
    return {
      status: 'upload_soon',
      reason: `Shared tag has ~${d} day(s) of leads left.`,
    }
  }
  return {
    status: 'healthy',
    reason: `Healthy — ~${d ?? '∞'} day(s) of shared capacity left.`,
  }
}

// ---------------------------------------------------------------------------
// Per-campaign computation
// ---------------------------------------------------------------------------

export function computeCampaign(
  campaign: Campaign,
  tags: TagVolume[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
  tagDemandMap: Map<string, number>,
  availableTags: string[] = [],
): CampaignComputed {
  const tagName = resolveTagName(campaign, tagMap, availableTags)
  const tag = findTag(tagName, tags)
  const demand = remainingEmailDemand(campaign, emailsPerLead)

  let campaignDaysLeft: number | null = null
  let sharedTagDaysLeft: number | null = null

  if (tag && tag.totalDailyVolume > 0) {
    campaignDaysLeft = Math.ceil(safeDivide(demand, tag.totalDailyVolume))
    const sharedDemand =
      tagName !== null
        ? tagDemandMap.get(tagName.toLowerCase()) ?? demand
        : demand
    sharedTagDaysLeft = Math.ceil(safeDivide(sharedDemand, tag.totalDailyVolume))
  }

  const { status, reason } = classifyStatus({
    notStarted: campaign.leadStats.notStarted,
    tag,
    sharedTagDaysLeft,
  })

  return {
    campaign,
    tagName,
    tag,
    progressPercent: progressPercent(campaign),
    remainingEmailDemand: demand,
    campaignDaysLeft,
    sharedTagDaysLeft,
    status,
    statusReason: reason,
  }
}

export function computeAllCampaigns(
  campaigns: Campaign[],
  tags: TagVolume[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
): CampaignComputed[] {
  const availableTags = tags.map((t) => t.tagName)
  const tagDemandMap = buildTagDemandMap(
    campaigns,
    tagMap,
    emailsPerLead,
    availableTags,
  )
  return campaigns.map((c) =>
    computeCampaign(c, tags, tagMap, emailsPerLead, tagDemandMap, availableTags),
  )
}

// ---------------------------------------------------------------------------
// Default sort: ending soonest first
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<CampaignStatus, number> = {
  critical: 0,
  upload_soon: 1,
  unmapped: 2,
  no_capacity: 3,
  healthy: 4,
  ended: 5,
}

export function sortCampaigns(rows: CampaignComputed[]): CampaignComputed[] {
  return [...rows].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (byStatus !== 0) return byStatus

    // Within the same status, fewest days left first (nulls last).
    const da = a.sharedTagDaysLeft
    const db = b.sharedTagDaysLeft
    if (da === null && db === null) return 0
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })
}

// ---------------------------------------------------------------------------
// Tag forecasts: join tag volume with demand of campaigns mapped to it
// ---------------------------------------------------------------------------

export function buildTagForecasts(
  tags: TagVolume[],
  campaigns: Campaign[],
  tagMap: CampaignTagMap,
  emailsPerLead: number,
): TagForecast[] {
  const availableTags = tags.map((t) => t.tagName)
  const demandMap = buildTagDemandMap(
    campaigns,
    tagMap,
    emailsPerLead,
    availableTags,
  )

  const countMap = new Map<string, number>()
  for (const c of campaigns) {
    const name = resolveTagName(c, tagMap, availableTags)
    if (!name) continue
    const key = name.toLowerCase()
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
  }

  return tags
    .map((t) => {
      const key = t.tagName.toLowerCase()
      const sharedTagDemand = demandMap.get(key) ?? 0
      const mappedCampaigns = countMap.get(key) ?? 0
      const sharedTagDaysLeft =
        mappedCampaigns > 0 && t.totalDailyVolume > 0
          ? Math.ceil(safeDivide(sharedTagDemand, t.totalDailyVolume))
          : null
      return { ...t, mappedCampaigns, sharedTagDemand, sharedTagDaysLeft }
    })
    .sort((a, b) => b.totalDailyVolume - a.totalDailyVolume)
}
