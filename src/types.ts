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
  sentCount: number
  replyCount: number
  oooReplyCount: number
  bounceCount: number
  totalCount: number
  draftedCount: number
  status: string
  leadStats: CampaignLeadStats
}

export type CampaignStatus =
  | 'critical'
  | 'upload_soon'
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

/** campaign_id (string) -> tag_name */
export type CampaignTagMap = Record<string, string>

/** Result of loading campaigns end-to-end. */
export interface LoadCampaignsResult {
  campaigns: Campaign[]
  warnings: string[]
}
