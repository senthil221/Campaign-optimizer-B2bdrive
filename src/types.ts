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
  is_smtp_success?: boolean | null
  is_imap_success?: boolean | null
  is_in_use?: boolean | null
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

/** Shape returned by GET /api/email-campaigns/{id}/analytics/overview → data */
export interface RawCampaignOverview {
  leads?: {
    total_leads_count?: number | null
    unique_sent_count?: number | null
    unique_delivered_count?: number | null
  } | null
  progress?: {
    leads_in_progress?: number | null
    completed?: number | null
    leads_to_be_started?: number | null
    total_leads?: number | null
  } | null
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
  /** False when Smartlead reports an SMTP/IMAP connection failure. */
  connected: boolean
  /** True when this inbox is assigned to at least one campaign. */
  isInUse: boolean
  tagIds: number[]
  tagNames: string[]
}

export interface TagVolume {
  tagId: number | null
  tagName: string
  /** Total inboxes with this tag (in-use + idle). */
  accountCount: number
  /** Sending capacity of inboxes assigned to campaigns. */
  totalDailyVolume: number
  usedToday: number
  remainingToday: number
  avgWarmupReputation: number
  /** Accounts under this tag with a reported connection failure. */
  disconnects: number
  /** Sending capacity of inboxes NOT assigned to any campaign. */
  idleVolume: number
  /** Count of inboxes NOT assigned to any campaign. */
  idleCount: number
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

/**
 * Cumulative, deletion-proof counters from the analytics overview endpoint.
 * `uniqueSent` keeps growing as leads are contacted and is NOT reduced when
 * completed leads are later deleted, so it anchors a stable progress %.
 */
export interface CampaignOverview {
  /** Unique leads ever contacted (cumulative — survives lead deletion). */
  uniqueSent: number
  /** Leads still mid-sequence right now. */
  inProgress: number
  /** Leads queued but never contacted yet. */
  toBeStarted: number
  /** Current (post-deletion) total lead count Smartlead reports. */
  totalLeads: number
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
  /** Schedule cap: max new leads contacted per day. null = unknown/not loaded. */
  maxLeadsPerDay: number | null
  leadStats: CampaignLeadStats
  /** Deletion-proof counters from analytics/overview. null = not loaded. */
  overview: CampaignOverview | null
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
  /** Count of ACTIVE campaigns mapped to this tag — drives the forecast. */
  mappedCampaigns: number
  /** Count of PAUSED campaigns mapped to this tag (excluded from forecast). */
  pausedCampaigns: number
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
  /** Total daily sending volume of the mapped tag's pool. null when no tag. */
  tagVolume: number | null
  /** Raw campaign status from Smartlead (ACTIVE / PAUSED / COMPLETED / …). */
  status: string
  /** Completed ÷ total leads × 100 — how far the campaign has run. */
  progressPercent: number
  sent: number
  replied: number
  /** replied ÷ sent × 100. */
  repliedRate: number
  oooReplied: number
  /** ooo ÷ sent × 100. */
  oooRate: number
  interested: number
  /** interested ÷ sent × 100 (a.k.a. positive rate / lead rate). */
  positiveRate: number
  /** Positive rate × 100 (e.g. 0.21% → 21%). */
  leadRate: number
  bounced: number
  /** bounced ÷ sent × 100. */
  bounceRate: number
  maxLeadsPerDay: number | null
}

/** One sequence step / A-B variant row from grouped_email_campaign_stats. */
export interface SequenceStat {
  id: number
  seqNumber: number
  variantLabel: string | null
  /** Variant id used to scope the inbox to this exact sequence/variant. */
  seqVariantId: number
  sent: number
  replied: number
  positiveReplies: number
  bounced: number
  senderBounced: number
  opened: number
  clicked: number
}

/**
 * One replied lead from the campaign inbox (email_campaign_stats). Flattened
 * from the nested reply_message_details / email_details payloads.
 */
export interface InboxReply {
  id: string
  /** Prospect's display name (first + last), best-effort. */
  leadName: string
  /** Prospect's email address. */
  leadEmail: string
  /** Our sending inbox the reply came back to. */
  fromEmail: string
  /** 1-based sequence step this reply is against. */
  seqNumber: number
  sentTime: string | null
  replyTime: string | null
  subject: string
  /** Clean reply text (just the new message, quoted thread stripped). */
  replySnippet: string
  /** Full reply text including any quoted thread. */
  replyText: string
  /** Plain-text of the email we originally sent this lead. */
  sentBody: string
  isBounced: boolean
  isOpened: boolean
  isClicked: boolean
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
