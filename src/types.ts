// ---------------------------------------------------------------------------
// Raw Smartlead API shapes (partial — only what we consume)
// ---------------------------------------------------------------------------

export interface RawTag {
  id: number
  name: string
}

export interface RawTagMapping {
  tag?: RawTag | null
}

export interface RawWarmupDetails {
  status?: string | null
  warmup_reputation?: number | string | null
}

export interface RawEmailAccount {
  id: number
  from_email?: string | null
  message_per_day?: number | null
  daily_sent_count?: number | null
  email_warmup_details?: RawWarmupDetails | null
  email_account_tag_mappings?: RawTagMapping[] | null
}

export interface RawCampaignLeadStats {
  total?: number | null
  paused?: number | null
  blocked?: number | null
  completed?: number | null
  inprogress?: number | null
  interested?: number | null
  notStarted?: number | null
  stopped?: number | null
  senderBounced?: number | null
}

/** Item returned by get-campaign-analytics → data.results[] */
export interface RawCampaignAnalytics {
  id?: number | null
  sent_count?: number | null
  reply_count?: number | null
  ooo_reply_count?: number | null
  total_count?: number | null
  drafted_count?: number | null
  bounce_count?: number | null
  status?: string | null
  campaign_lead_stats?: RawCampaignLeadStats | null
}

/** Item returned by the campaign list endpoint */
export interface RawCampaignListItem {
  id?: number | null
  name?: string | null
  status?: string | null
}

// ---------------------------------------------------------------------------
// Normalized domain models
// ---------------------------------------------------------------------------

export interface EmailAccount {
  id: number
  fromEmail: string
  messagePerDay: number
  dailySentCount: number
  warmupStatus: string
  warmupReputation: number
  tagIds: number[]
  tagNames: string[]
}

export interface TagVolume {
  tagId: number | null
  tagName: string
  accountCount: number
  totalDailyVolume: number
  usedToday: number
  remainingToday: number
  avgWarmupReputation: number
}

export interface CampaignLeadStats {
  total: number
  completed: number
  inprogress: number
  interested: number
  notStarted: number
  paused: number
  blocked: number
  stopped: number
  senderBounced: number
}

export interface Campaign {
  campaignId: number
  campaignName: string
  nameMissing: boolean
  /** Tag names Smartlead returns on the campaign itself (the colored pills). */
  apiTags: string[]
  sentCount: number
  replyCount: number
  oooReplyCount: number
  bounceCount: number
  totalCount: number
  draftedCount: number
  status: string
  leadStats: CampaignLeadStats
}

/** Normalized campaign-list row (ids + names + status + tags). */
export interface CampaignListEntry {
  id: number
  name: string | null
  status: string | null
  tags: string[]
}

export type CampaignStatus =
  | 'critical'
  | 'upload_soon'
  | 'unmapped'
  | 'no_capacity'
  | 'healthy'
  | 'ended'

export interface CampaignComputed {
  campaign: Campaign
  tagName: string | null
  tag: TagVolume | null
  progressPercent: number
  remainingEmailDemand: number
  campaignDaysLeft: number | null
  sharedTagDaysLeft: number | null
  status: CampaignStatus
  statusReason: string
}

/** A tag's volume joined with the demand of campaigns mapped to it. */
export interface TagForecast extends TagVolume {
  mappedCampaigns: number
  /** Sum of leadStats.total across every campaign mapped to this tag. */
  leadsTotal: number
  /** Sum of leadStats.notStarted across every campaign mapped to this tag. */
  notStartedTotal: number
  /** notStartedTotal × emailsPerLead — total emails still owed by this tag. */
  sharedTagDemand: number
  sharedTagDaysLeft: number | null
  status: CampaignStatus
}

/** Per-campaign performance row for the Smartlead-style metrics table. */
export interface CampaignPerformance {
  campaign: Campaign
  tagName: string | null
  sent: number
  replied: number
  oooReplied: number
  interested: number
  /** interested ÷ sent × 100 (per-email basis). */
  leadRate: number
  bounced: number
}

/** campaign_id (string) -> tag_name */
export type CampaignTagMap = Record<string, string>

/** Result of loading campaigns end-to-end. */
export interface LoadCampaignsResult {
  campaigns: Campaign[]
  warnings: string[]
  /** How many campaigns had at least one tag returned by Smartlead. */
  taggedCount: number
  /** Raw first campaign-list row, for the debug drawer (tag field discovery). */
  rawSample: unknown
}
