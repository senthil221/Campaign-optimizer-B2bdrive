// ---------------------------------------------------------------------------
// Raw Smartlead API shapes (partial — only what we consume)
// ---------------------------------------------------------------------------

export interface RawTag {
  id: number
  name: string
}

export interface SmartleadTag {
  id: number
  name: string
  color: string
  createdAt: string | null
}

export interface RawTagMapping {
  tag?: RawTag | null
}

/**
 * Confirmed shape of email_warmup_details on
 * /api/email-account/get-total-email-accounts: status, reputation and a
 * blocked flag. Notably it carries neither a per-day warmup limit nor a sent
 * counter, so those two columns cannot be filled from the account list.
 */
export interface RawWarmupDetails {
  status?: string | null
  warmup_reputation?: number | string | null
  /**
   * True when Smartlead has stopped warming this inbox. Recorded because it is
   * on the payload, but deliberately unused: a blocked warmup is its own
   * condition and is not a signal that a tenant sending threshold was hit.
   */
  is_warmup_blocked?: boolean | null
}

export interface RawDnsValidationStatus {
  isSPFVerified?: boolean | null
  isDKIMVerified?: boolean | null
  isDMARCVerified?: boolean | null
  lastVerifiedTime?: string | null
}

export interface RawEmailAccount {
  id: number
  from_email?: string | null
  from_name?: string | null
  created_at?: string | null
  message_per_day?: number | null
  daily_sent_count?: number | null
  is_smtp_success?: boolean | null
  is_imap_success?: boolean | null
  is_in_use?: boolean | null
  smart_sender_flag?: string | null
  smtp_host?: string | null
  type?: string | null
  email_warmup_details?: RawWarmupDetails | null
  email_account_tag_mappings?: RawTagMapping[] | null
  dns_validation_status?: RawDnsValidationStatus | null
  /**
   * Minutes Smartlead waits between sends. The bulk-config write calls this
   * minTimeToWaitInMins; the account list returns it as time_to_wait_in_mins.
   */
  time_to_wait_in_mins?: number | null
  /** INSUFFICIENT_DATA / etc. The account list carries no error string. */
  health_status?: string | null
  total_spam_count?: number | null
}

export interface TagSendPerformance {
  tagId: number | null
  tagName: string
  sent: number
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
  created_at?: string | null
}

// ---------------------------------------------------------------------------
// Normalized domain models
// ---------------------------------------------------------------------------

export interface EmailAccount {
  id: number
  fromEmail: string
  fromName: string
  /** Mailbox provider reported by Smartlead, such as OUTLOOK or GMAIL. */
  providerType: string
  createdAt: string | null
  messagePerDay: number
  dailySentCount: number
  warmupStatus: string
  warmupReputation: number
  /**
   * Minutes between sends. Null when Smartlead's payload omits the field, so
   * the column can show "—" rather than a misleading 0.
   */
  minTimeBtwnEmails: number | null
/**
   * Warmup emails per day, and warmup emails sent to date. Smartlead's account
   * list reports neither, so both are currently always null and their columns
   * render as "not reported". They stay on the model so a future warmup-stats
   * source can fill them without touching the table.
   */
  warmupPerDay: number | null
  warmupSentCount: number | null
  /**
   * Last error Smartlead recorded for the inbox, which the tenant-threshold
   * flag matches against. Always '' today: the account list carries no error
   * string, so no source has been wired up yet.
   */
  errorMessage: string
  /** False when Smartlead reports an SMTP/IMAP connection failure. */
  connected: boolean
  /** True when this inbox is assigned to at least one campaign. */
  isInUse: boolean
  dnsSpfVerified: boolean
  dnsDkimVerified: boolean
  dnsDmarcVerified: boolean
  dnsLastVerifiedAt: string | null
  tagIds: number[]
  tagNames: string[]
  /** Original Smartlead row, retained for the server-side bulk settings relay. */
  rawAccount?: RawEmailAccount
}

export interface DomainManagementRow {
  domain: string
  providerTypes: string[]
  accounts: EmailAccount[]
  senderNames: Array<{
    name: string
    inboxCount: number
  }>
  accountCount: number
  connectedCount: number
  warmupEnabledCount: number
  warmupState: 'enabled' | 'disabled' | 'mixed'
  createdAt: string | null
  ageDays: number | null
  dailyLimit: number | null
  dailyLimitMin: number
  dailyLimitMax: number
  tagNames: string[]
  /** Shared min-wait across the domain's inboxes; null when they disagree. */
  minWait: number | null
  minWaitMin: number
  minWaitMax: number
  /** Shared warmup-per-day across the inboxes; null when they disagree. */
  warmupPerDay: number | null
  /** Total warmup emails sent across the domain's inboxes; null when none of
   * them report it, so the column can say "not reported" rather than "0". */
  warmupSentCount: number | null
  /** Inboxes whose Smartlead error mentions an exceeded tenant threshold. */
  tenantThresholdCount: number
}

export type DomainSettingsAction =
  | 'tags'
  | 'outbound'
  | 'warmup'
  | 'warmup_toggle'

export interface DomainTagSettings {
  tags: string[]
}

/**
 * Smartlead's `update_outbound` endpoint replaces the whole outbound settings
 * block rather than merging it, so any field left out is reset to Smartlead's
 * default. Both values are therefore required on every outbound update.
 */
export interface DomainOutboundSettings {
  messagePerDay: number
  minTimeToWaitInMins: number
  status: 'ACTIVE'
}

/**
 * Paired with `preserveMessagePerDay`. `messagePerDay` is deliberately absent so
 * that a dropped flag produces a 400 instead of silently writing a default max.
 */
export interface DomainOutboundPreserveSettings {
  minTimeToWaitInMins: number
  status: 'ACTIVE'
}

/** One `update_outbound` call issued against inboxes sharing a current max. */
export interface DomainOutboundGroupResult {
  messagePerDay: number
  domainCount: number
  accountCount: number
}

export interface DomainWarmupSettings {
  isRampupEnabled: boolean
  maxEmailPerDay: number
  rampupValue: number
  replyRate: number
  status: 'ACTIVE'
  warmupTagIdentifier: string
}

/**
 * Turning warmup on or off. Smartlead takes this as a one-field write, leaving
 * the inbox's warmup config (per-day, ramp-up, reply rate) untouched — so this
 * deliberately carries nothing but the flag.
 */
export interface DomainWarmupToggleSettings {
  status: 'ACTIVE' | 'INACTIVE'
}

export interface DomainBulkUpdateRequest {
  action: DomainSettingsAction
  domains: string[]
  accounts: EmailAccount[]
  tags?: string[]
  settings?:
    | DomainOutboundSettings
    | DomainOutboundPreserveSettings
    | DomainWarmupSettings
    | DomainWarmupToggleSettings
  /**
   * Outbound only. Keeps every inbox's existing `message_per_day` by splitting
   * the write into one upstream call per distinct current value.
   */
  preserveMessagePerDay?: boolean
}

/** Outcome of a bulk campaign delete; partial success is reported per id. */
export interface CampaignDeleteResult {
  deleted: number[]
  failed: Array<{ id: number; error: string }>
  message: string
}

/** Per-campaign maintenance actions that Smartlead runs one campaign at a time. */
export type CampaignOperation =
  | 'reallocate-mailboxes'
  | 'reschedule-failed-leads'

/** Outcome of running a CampaignOperation across a selection. */
export interface CampaignOperationResult {
  succeeded: number[]
  failed: Array<{ id: number; error: string }>
  message: string
}

export interface DomainHealthMetric {
  domain: string
  sent: number
  replied: number
  bounced: number
  replyRate: number
  bounceRate: number
}

/** One RBL/DNSBL that reported the sending domain or its IP. */
export interface DomainBlacklistListing {
  /** Whether the listing is against the sending domain or its sending IP. */
  target: 'domain' | 'ip'
  rblName: string
  rblWebsite: string
  reason: string
}

/**
 * A sending domain's RBL/DNSBL blacklist status, aggregated from Smartlead's
 * per-campaign black-list-domains endpoint (deduped across campaigns).
 */
export interface DomainBlacklistStatus {
  domain: string
  /** Sending IP the domain resolves to, when reported. */
  ip: string | null
  /** Number of RBLs listing the domain itself. */
  domainBlacklistCount: number
  /** Number of RBLs listing the sending IP. */
  ipBlacklistCount: number
  /** Total RBLs checked for the domain. */
  totalTests: number
  listings: DomainBlacklistListing[]
}

export type BounceRiskCategory =
  | 'tenant_threshold'
  | 'spam_rejected'
  | 'sender_550'

export interface BounceRiskSample {
  senderEmail: string
  category: BounceRiskCategory
  label: string
  occurredAt: string
  diagnostic: string
  senderBounce: boolean
}

export interface DomainBounceRisk {
  domain: string
  total: number
  affectedInboxes: number
  latestAt: string
  inboxes: string[]
  categories: Array<{
    category: BounceRiskCategory
    label: string
    count: number
  }>
  samples: BounceRiskSample[]
}

export interface DomainHealthRow extends DomainHealthMetric {
  providerTypes: string[]
  tagNames: string[]
  accountCount: number
  messagePerDay: number
  avgWarmupReputation: number | null
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  dnsValidated: boolean
  missingDns: string[]
  inboxRisk: DomainBounceRisk | null
}

export interface TagVolume {
  tagId: number | null
  tagName: string
  /** Total inboxes with this tag (in-use + idle). */
  accountCount: number
  /** Distinct sender domains represented by the accounts carrying this tag. */
  domainCount: number
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
  /**
   * When the campaign was created, from the campaign list. Drives the
   * Lifetime / Today / 3D filter. null when the list endpoint omits it, and
   * such campaigns are only ever shown under Lifetime.
   */
  createdAt: string | null
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
  /** Plain-text / tracking toggles from the campaign's General settings. null = not loaded. */
  generalSettings: CampaignGeneralSettings | null
}

/** One active campaign selected for automatic campaign-tag → sender-pool sync. */
export interface BulkSyncCampaignTarget {
  campaignId: number
  campaignName: string
  tagKey: string
  tagName: string
}

/** A deduplicated email-account pool for one normalized Smartlead tag name. */
export interface BulkSyncTagPool {
  tagKey: string
  tagName: string
  accountIds: number[]
}

/** Compact request shared by bulk-sync preview and execution. */
export interface BulkSyncPlan {
  campaigns: BulkSyncCampaignTarget[]
  pools: BulkSyncTagPool[]
}

export interface BulkSyncPreview {
  campaignId: number
  campaignName: string
  tagName: string
  currentCount: number
  desiredCount: number
  toAddCount: number
  toRemoveCount: number
  error?: string
}

export interface BulkSyncResult {
  campaignId: number
  campaignName: string
  tagName: string
  status: 'synced' | 'unchanged' | 'error'
  added: number
  removed: number
  error?: string
}

/** Plain-text and open/click tracking toggles from a campaign's General settings tab. */
export interface CampaignGeneralSettings {
  sendAsPlainText: boolean
  forcePlainText: boolean
  dontTrackOpens: boolean
  dontTrackClicks: boolean
}

/** Normalized campaign-list row (ids + names + status + tags). */
export interface CampaignListEntry {
  id: number
  name: string | null
  status: string | null
  tags: string[]
  /** ISO creation timestamp from the campaign list. null when unreported. */
  createdAt: string | null
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
  /** Recipient/list bounces only: total bounce_count minus sender bounces. */
  bounced: number
  /** recipient bounced ÷ sent × 100. */
  bounceRate: number
  /** Sender-side bounces (the sending mailbox itself bounced). */
  senderBounced: number
  /** senderBounced ÷ sent × 100. */
  senderBounceRate: number
  maxLeadsPerDay: number | null
}

/** One sequence step / A-B variant row from grouped_email_campaign_stats. */
export interface SequenceStat {
  id: number
  seqNumber: number
  variantLabel: string | null
  /**
   * Sequence-step id (email_campaign_seq_id). Always present, so it scopes the
   * inbox even for single-variant steps where seqVariantId is null.
   */
  emailCampaignSeqId: number
  /** Variant id used to scope the inbox to this exact sequence/variant. */
  seqVariantId: number
  sent: number
  replied: number
  positiveReplies: number
  bounced: number
  /** High-confidence permanent invalid/unknown recipients in this variant. */
  invalidBounces: number | null
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
  /** Original reply HTML (rendered in a sandboxed frame for full fidelity). */
  replyHtml: string
  /** Plain-text of the email we originally sent this lead. */
  sentBody: string
  /** Original sent-email HTML. */
  sentHtml: string
  isBounced: boolean
  isOpened: boolean
  isClicked: boolean
}

// ---------------------------------------------------------------------------
// Sequence editor (live campaign sequences: enable/disable + edit copy)
// ---------------------------------------------------------------------------

/** Raw variant as returned by GET /api/email-campaigns/{id}/sequences. */
export interface RawSeqVariant {
  id?: number | null
  variantLabel?: string | null
  subject?: string | null
  emailBody?: string | null
  isDeleted?: boolean | null
}

/** Raw sequence step from the same endpoint. */
export interface RawSequenceStep {
  id?: number | null
  seqNumber?: number | null
  seqType?: string | null
  seqDelayDetails?: { delayInDays?: number | null } | null
  seqVariants?: RawSeqVariant[] | null
}

/** One A/B/C variant of a sequence step, normalized for editing. */
export interface EditableVariant {
  /** seq_variant id — the stable key used to target this variant on save. */
  id: number
  variantLabel: string | null
  subject: string
  /** Raw Smartlead HTML (with {{variables}} and {spintax}) — preserved verbatim. */
  emailBody: string
  /** True = disabled in Smartlead (isDeleted). Toggling flips this. */
  isDeleted: boolean
}

/** One sequence step (email in the drip), normalized for editing. */
export interface EditableSequence {
  /** email_campaign_seq id — targets this step on save. */
  id: number
  seqNumber: number
  seqType: string
  delayInDays: number
  variants: EditableVariant[]
}

/** The full editable sequence payload for one campaign. */
export interface CampaignSequencePayload {
  campaignId: number
  sequences: EditableSequence[]
}

/** Delta sent to the save endpoint — never the whole payload, never raw IDs guessed. */
export interface SequenceEditRequest {
  campaignId: number
  /** Omitted when addSequence is true — there's no existing step to target yet. */
  sequenceId?: number
  variantId?: number
  subject?: string
  emailBody?: string
  /** enabled:true → isDeleted:false, enabled:false → isDeleted:true. */
  enabled?: boolean
  delayInDays?: number
  /** When true, append a brand-new sequence step instead of editing sequenceId. */
  addSequence?: boolean
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
