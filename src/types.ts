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
  completed?: number | null
  inprogress?: number | null
  notStarted?: number | null
  paused?: number | null
  blocked?: number | null
  stopped?: number | null
}

export interface RawCampaign {
  id?: number | null
  campaign_id?: number | null
  name?: string | null
  campaign_name?: string | null
  sent_count?: number | null
  reply_count?: number | null
  ooo_reply_count?: number | null
  bounce_count?: number | null
  total_count?: number | null
  status?: string | null
  campaign_lead_stats?: RawCampaignLeadStats | null
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

export interface TagCapacity {
  tagId: number | null
  tagName: string
  accountCount: number
  totalDailyCapacity: number
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
}

export interface Campaign {
  campaignId: number
  campaignName: string
  sentCount: number
  replyCount: number
  oooReplyCount: number
  bounceCount: number
  totalCount: number
  status: string
  leadStats: CampaignLeadStats
}

export type AlertLevel =
  | 'healthy'
  | 'upload_soon'
  | 'critical'
  | 'ended'
  | 'no_capacity'

export interface CampaignComputed {
  campaign: Campaign
  tagName: string | null
  tag: TagCapacity | null
  progressPercent: number
  remainingEmailDemand: number
  campaignDaysLeft: number | null
  sharedTagDaysLeft: number | null
  alertLevel: AlertLevel
  alertReason: string
}

// campaign_id -> tag_name
export type CampaignTagMap = Record<string, string>
