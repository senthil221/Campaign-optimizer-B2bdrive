import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BulkSyncPlan,
  BulkSyncPreview,
  BulkSyncResult,
  Campaign,
  CampaignTagMap,
  DomainBlacklistStatus,
  DomainBounceRisk,
  DomainBulkUpdateRequest,
  DomainHealthMetric,
  EmailAccount,
} from './types'
import {
  fetchCampaignInbox,
  fetchCampaignSequences,
  executeBulkSync,
  fetchEmailAccounts,
  fetchDomainBounceRisks,
  fetchDomainHealthMetrics,
  fetchTagSendPerformance,
  previewBulkSync,
  bulkReconnectEmailAccounts,
  fetchBlacklistedDomains,
  fetchSequenceEditor,
  loadCampaigns,
  saveSequenceEdit,
  updateCampaignStatus,
  updateDomainSettings,
  validateDomainDns,
  updateMaxLeadsPerDay,
  type CampaignStatusAction,
  type InboxQuery,
} from './services/smartlead'
import type { SequenceEditRequest } from './types'
import {
  buildCampaignPerformance,
  buildTagForecasts,
} from './utils/campaignCalculations'
import { buildTagVolumes } from './utils/tagCapacity'
import {
  buildBulkSyncSelection,
  type BulkSyncSelection,
} from './utils/bulkSync'
import {
  loadEmailsPerLead,
  loadTagMap,
  loadTheme,
  loadVisibleColumns,
  saveEmailsPerLead,
  saveTheme,
  saveVisibleColumns,
  PERF_COLUMNS_KEY,
  TAG_COLUMNS_KEY,
  type Theme,
} from './utils/storage'
import Header, { type AppPage } from './components/Header'
import SummaryCards from './components/SummaryCards'
import TagForecastSummary, { TAG_COLUMNS } from './components/TagForecastSummary'
import CampaignPerformanceTable, {
  PERF_COLUMNS,
} from './components/CampaignPerformanceTable'
import DomainHealthPage from './components/DomainHealthPage'
import DomainManagementPage from './components/DomainManagementPage'
import BulkSyncModal from './components/BulkSyncModal'
import { buildDomainHealthRows } from './utils/domainHealth'
import { domainFromEmail, isValidDomain } from './utils/domainManagement'

// Default: every column visible. Stored prefs are merged over this so a newly
// added column shows up by default for existing users.
const allVisible = (cols: readonly { id: string }[]): Record<string, boolean> =>
  Object.fromEntries(cols.map((c) => [c.id, true]))
const DEFAULT_PERF_COLUMNS: Record<string, boolean> = {
  ...allVisible(PERF_COLUMNS),
  tag: false,
  ooo: false,
  status: false,
}
const DEFAULT_TAG_COLUMNS: Record<string, boolean> = {
  ...allVisible(TAG_COLUMNS),
  demand: false,
}

// One-time migration: the Tag column is now hidden by default. Drop any
// previously-persisted `tag` visibility so existing browsers pick up the new
// default, without disturbing other saved column choices. Runs once at module
// load (before render), so the user can still re-enable Tag from the Columns
// menu afterwards. Kept out of the useState initializer, which StrictMode
// double-invokes in dev.
const PERF_TAG_MIGRATION_KEY = 'sl_perf_tag_hidden_v1'
function migratePerfColumnsOnce(): void {
  try {
    if (localStorage.getItem(PERF_TAG_MIGRATION_KEY)) return
    const stored = loadVisibleColumns(PERF_COLUMNS_KEY)
    if ('tag' in stored) {
      delete stored.tag
      saveVisibleColumns(PERF_COLUMNS_KEY, stored)
    }
    localStorage.setItem(PERF_TAG_MIGRATION_KEY, '1')
  } catch {
    /* ignore disabled storage */
  }
}
migratePerfColumnsOnce()

const IST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function getReportingDate(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  )
  return IST_DATE_FORMAT.format(
    hour < 3 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now,
  )
}

function getIstDateOffset(daysAgo: number, now = new Date()): string {
  return IST_DATE_FORMAT.format(
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
  )
}

function bulkSyncPlanForCampaigns(
  plan: BulkSyncPlan,
  campaignIds: Set<number>,
): BulkSyncPlan {
  const selectedCampaigns = plan.campaigns.filter((campaign) =>
    campaignIds.has(campaign.campaignId),
  )
  const poolKeys = new Set(selectedCampaigns.map((campaign) => campaign.tagKey))
  return {
    campaigns: selectedCampaigns,
    pools: plan.pools.filter((pool) => poolKeys.has(pool.tagKey)),
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [activePage, setActivePage] = useState<AppPage>('campaigns')
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  // Tags come from Smartlead's own campaign tags. Any legacy manual overrides
  // in localStorage are still honoured, but the UI no longer edits them.
  const [tagMap] = useState<CampaignTagMap>(loadTagMap)
  const [emailsPerLead, setEmailsPerLead] = useState<number>(loadEmailsPerLead)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => ({
    ...DEFAULT_PERF_COLUMNS,
    ...loadVisibleColumns(PERF_COLUMNS_KEY),
  }))
  const [tagCols, setTagCols] = useState<Record<string, boolean>>(() => ({
    ...DEFAULT_TAG_COLUMNS,
    ...loadVisibleColumns(TAG_COLUMNS_KEY),
  }))

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tagSends, setTagSends] = useState<Record<string, number>>({})
  const [reportingDate, setReportingDate] = useState(getReportingDate)
  const [domainStartDate, setDomainStartDate] = useState(() =>
    getIstDateOffset(2),
  )
  const [domainEndDate, setDomainEndDate] = useState(() =>
    getIstDateOffset(0),
  )
  const [domainMetrics, setDomainMetrics] = useState<DomainHealthMetric[]>([])
  const [domainBounceRisks, setDomainBounceRisks] = useState<
    DomainBounceRisk[]
  >([])
  const [domainLoading, setDomainLoading] = useState(false)
  const [domainLoaded, setDomainLoaded] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainLastUpdated, setDomainLastUpdated] = useState<Date | null>(null)
  const [managementLoading, setManagementLoading] = useState(false)
  const [managementStartDate, setManagementStartDate] = useState(() =>
    getIstDateOffset(2),
  )
  const [managementEndDate, setManagementEndDate] = useState(() =>
    getIstDateOffset(0),
  )
  const [managementDomainMetrics, setManagementDomainMetrics] = useState<
    DomainHealthMetric[]
  >([])
  const [managementHealthLoaded, setManagementHealthLoaded] = useState(false)
  const [managementMetricsAvailable, setManagementMetricsAvailable] =
    useState(false)
  const [managementError, setManagementError] = useState<string | null>(null)
  const [managementLastUpdated, setManagementLastUpdated] =
    useState<Date | null>(null)
  const [blacklistByDomain, setBlacklistByDomain] = useState<
    Map<string, DomainBlacklistStatus>
  >(() => new Map())
  const [blacklistLoading, setBlacklistLoading] = useState(false)
  const [blacklistLoaded, setBlacklistLoaded] = useState(false)
  const [blacklistError, setBlacklistError] = useState<string | null>(null)
  const [bulkSyncSelection, setBulkSyncSelection] =
    useState<BulkSyncSelection | null>(null)
  const [bulkSyncPreviews, setBulkSyncPreviews] = useState<
    BulkSyncPreview[] | null
  >(null)
  const [bulkSyncResults, setBulkSyncResults] = useState<
    BulkSyncResult[] | null
  >(null)
  const [bulkSyncLoading, setBulkSyncLoading] = useState(false)
  const [bulkSyncExecuting, setBulkSyncExecuting] = useState(false)
  const [bulkSyncError, setBulkSyncError] = useState<string | null>(null)

  // Latest campaigns, for reverting an optimistic edit without stale closures.
  const campaignsRef = useRef<Campaign[]>([])
  useEffect(() => {
    campaignsRef.current = campaigns
  }, [campaigns])

  // Latest accounts, so the blacklist sweep can read live domains without
  // re-creating its callback on every account refresh.
  const accountsRef = useRef<EmailAccount[]>([])
  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])

  // Persist user settings
  useEffect(() => saveEmailsPerLead(emailsPerLead), [emailsPerLead])
  useEffect(() => saveVisibleColumns(PERF_COLUMNS_KEY, visibleCols), [visibleCols])
  useEffect(() => saveVisibleColumns(TAG_COLUMNS_KEY, tagCols), [tagCols])
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#e5e6e0' : '#0a0a0b')
    saveTheme(theme)
  }, [theme])

  // Credentials are injected server-side by the /api proxy → empty strings here.
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setWarnings([])
    const date = getReportingDate()
    setReportingDate(date)
    const [accRes, campRes, sendsRes] = await Promise.allSettled([
      fetchEmailAccounts(''),
      loadCampaigns('', ''),
      fetchTagSendPerformance('', date),
    ])

    const errs: string[] = []
    const nextWarnings: string[] = []
    if (accRes.status === 'fulfilled') setAccounts(accRes.value)
    else errs.push(`Accounts: ${accRes.reason?.message ?? accRes.reason}`)

    if (campRes.status === 'fulfilled') {
      setCampaigns(campRes.value.campaigns)
      nextWarnings.push(...campRes.value.warnings)
    } else {
      errs.push(`Campaigns: ${campRes.reason?.message ?? campRes.reason}`)
    }

    setError(errs.length ? errs.join('  •  ') : null)
    if (sendsRes.status === 'fulfilled') {
      const next: Record<string, number> = {}
      for (const row of sendsRes.value.rows) {
        if (row.tagId) next[`id:${row.tagId}`] = row.sent
        if (row.tagName) next[`name:${row.tagName.toLowerCase()}`] = row.sent
      }
      setTagSends(next)
      setReportingDate(sendsRes.value.reportingDate)
    } else {
      nextWarnings.push(
        `Live sent counts unavailable: ${sendsRes.reason?.message ?? sendsRes.reason}`,
      )
    }

    setWarnings(nextWarnings)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const loadDomainHealth = useCallback(
    async (
      startDate: string,
      endDate: string,
      refreshAccounts: boolean,
    ) => {
      if (!startDate || !endDate || startDate > endDate) {
        return
      }
      setDomainLoading(true)
      setDomainError(null)
      const [accountsResult, metricsResult, risksResult] =
        await Promise.allSettled([
          refreshAccounts ? fetchEmailAccounts('') : Promise.resolve(null),
          fetchDomainHealthMetrics('', startDate, endDate),
          fetchDomainBounceRisks('', startDate, endDate),
        ])

      const failures: string[] = []
      if (accountsResult.status === 'fulfilled') {
        if (accountsResult.value) setAccounts(accountsResult.value)
      } else {
        failures.push(
          `Mailbox DNS data: ${accountsResult.reason?.message ?? accountsResult.reason}`,
        )
      }
      if (metricsResult.status === 'fulfilled') {
        setDomainMetrics(metricsResult.value)
      } else {
        failures.push(
          `Domain analytics: ${metricsResult.reason?.message ?? metricsResult.reason}`,
        )
      }
      if (risksResult.status === 'fulfilled') {
        setDomainBounceRisks(risksResult.value)
      } else {
        setDomainBounceRisks([])
        failures.push(
          `Inbox risk: ${risksResult.reason?.message ?? risksResult.reason}`,
        )
      }

      setDomainError(failures.length > 0 ? failures.join('  •  ') : null)
      setDomainLoaded(true)
      setDomainLastUpdated(new Date())
      setDomainLoading(false)
    },
    [],
  )

  const refreshDomainHealth = useCallback(
    () => loadDomainHealth(domainStartDate, domainEndDate, true),
    [domainEndDate, domainStartDate, loadDomainHealth],
  )

  const applyDomainRange = useCallback(
    () => loadDomainHealth(domainStartDate, domainEndDate, false),
    [domainEndDate, domainStartDate, loadDomainHealth],
  )

  const applyDomainPreset = useCallback(
    (days: 1 | 3 | 7) => {
      const now = new Date()
      const endDate = getIstDateOffset(0, now)
      const startDate = getIstDateOffset(days - 1, now)
      setDomainStartDate(startDate)
      setDomainEndDate(endDate)
      void loadDomainHealth(startDate, endDate, false)
    },
    [loadDomainHealth],
  )

  const loadDomainManagement = useCallback(
    async (startDate: string, endDate: string, refreshAccounts: boolean) => {
      if (!startDate || !endDate || startDate > endDate) {
        return
      }
      setManagementLoading(true)
      setManagementError(null)
      const [accountsResult, metricsResult] = await Promise.allSettled([
        refreshAccounts ? fetchEmailAccounts('') : Promise.resolve(null),
        fetchDomainHealthMetrics('', startDate, endDate),
      ])
      const failures: string[] = []
      if (accountsResult.status === 'fulfilled') {
        if (accountsResult.value) setAccounts(accountsResult.value)
      } else {
        failures.push(
          `Accounts: ${accountsResult.reason?.message ?? accountsResult.reason}`,
        )
      }
      if (metricsResult.status === 'fulfilled') {
        setManagementDomainMetrics(metricsResult.value)
        setManagementMetricsAvailable(true)
      } else {
        failures.push(
          `Domain health: ${metricsResult.reason?.message ?? metricsResult.reason}`,
        )
      }
      setManagementError(failures.length > 0 ? failures.join('  •  ') : null)
      setManagementHealthLoaded(true)
      setManagementLastUpdated(new Date())
      setManagementLoading(false)
    },
    [],
  )

  const refreshDomainManagement = useCallback(
    () => loadDomainManagement(managementStartDate, managementEndDate, true),
    [loadDomainManagement, managementEndDate, managementStartDate],
  )

  const applyManagementRange = useCallback(
    () => loadDomainManagement(managementStartDate, managementEndDate, false),
    [loadDomainManagement, managementEndDate, managementStartDate],
  )

  const applyManagementPreset = useCallback(
    (days: 1 | 3 | 7) => {
      const now = new Date()
      const endDate = getIstDateOffset(0, now)
      const startDate = getIstDateOffset(days - 1, now)
      setManagementStartDate(startDate)
      setManagementEndDate(endDate)
      void loadDomainManagement(startDate, endDate, false)
    },
    [loadDomainManagement],
  )

  // Sweep campaigns for per-domain RBL/DNSBL blacklist status. Reads the latest
  // campaigns + accounts from refs, and passes the managed domains as targets
  // so the service can stop once every one of them has a status.
  const loadBlacklist = useCallback(async () => {
    const campaignIds = campaignsRef.current.map((c) => c.campaignId)
    if (campaignIds.length === 0) return
    const targetDomains = Array.from(
      new Set(
        accountsRef.current
          .map((account) => domainFromEmail(account.fromEmail))
          .filter(isValidDomain),
      ),
    )
    setBlacklistLoading(true)
    setBlacklistError(null)
    try {
      const result = await fetchBlacklistedDomains(
        '',
        campaignIds,
        targetDomains,
      )
      setBlacklistByDomain(result)
      setBlacklistLoaded(true)
    } catch (error) {
      setBlacklistError(
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setBlacklistLoading(false)
    }
  }, [])

  // The Domain Management refresh button reloads health metrics/accounts and
  // re-sweeps blacklist status together.
  const refreshDomainManagementAll = useCallback(() => {
    void loadBlacklist()
    return refreshDomainManagement()
  }, [loadBlacklist, refreshDomainManagement])

  const handleDomainSettingsUpdate = useCallback(
    async (request: DomainBulkUpdateRequest): Promise<string> => {
      const result = await updateDomainSettings('', request)
      setManagementLoading(true)
      setManagementError(null)
      try {
        setAccounts(await fetchEmailAccounts(''))
        setManagementLastUpdated(new Date())
        return result.message
      } catch (refreshError) {
        const detail =
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError)
        setManagementError(`Settings updated, but refresh failed: ${detail}`)
        return `${result.message} Refresh the page to confirm the latest values.`
      } finally {
        setManagementLoading(false)
      }
    },
    [],
  )

  const handleValidateDomainDns = useCallback(async (): Promise<string> => {
    const message = await validateDomainDns('')
    setManagementLoading(true)
    setManagementError(null)
    try {
      setAccounts(await fetchEmailAccounts(''))
      setManagementLastUpdated(new Date())
    } catch (refreshError) {
      const detail =
        refreshError instanceof Error ? refreshError.message : String(refreshError)
      setManagementError(
        `DNS validation completed, but account refresh failed: ${detail}`,
      )
    } finally {
      setManagementLoading(false)
    }
    return message
  }, [])

  const handleBulkReconnect = useCallback(async (): Promise<string> => {
    const message = await bulkReconnectEmailAccounts('')
    setManagementLoading(true)
    setManagementError(null)
    try {
      setAccounts(await fetchEmailAccounts(''))
      setManagementLastUpdated(new Date())
    } catch (refreshError) {
      const detail =
        refreshError instanceof Error ? refreshError.message : String(refreshError)
      setManagementError(
        `Bulk reconnect started, but account refresh failed: ${detail}`,
      )
    } finally {
      setManagementLoading(false)
    }
    return message
  }, [])

  useEffect(() => {
    if (activePage === 'domains' && !domainLoaded && !domainLoading) {
      void applyDomainRange()
    }
  }, [
    activePage,
    applyDomainRange,
    domainLoaded,
    domainLoading,
  ])

  useEffect(() => {
    if (
      activePage === 'domain-management' &&
      !managementHealthLoaded &&
      !managementLoading
    ) {
      void refreshDomainManagement()
    }
  }, [
    activePage,
    managementHealthLoaded,
    managementLoading,
    refreshDomainManagement,
  ])

  // Blacklist status needs both the campaign list (to sweep) and accounts (to
  // know when every managed domain is covered), so it waits for both before the
  // first sweep. Runs once per visit; the Refresh button re-runs it explicitly.
  useEffect(() => {
    if (
      activePage === 'domain-management' &&
      !blacklistLoaded &&
      !blacklistLoading &&
      campaigns.length > 0 &&
      accounts.length > 0
    ) {
      void loadBlacklist()
    }
  }, [
    accounts.length,
    activePage,
    blacklistLoaded,
    blacklistLoading,
    campaigns.length,
    loadBlacklist,
  ])

  // ---- Derived data (calculations kept out of the components) ----
  const realTags = useMemo(
    () => buildTagVolumes(accounts).filter((t) => t.tagName !== 'Untagged'),
    [accounts],
  )

  const tagOptions = useMemo(() => realTags.map((t) => t.tagName), [realTags])

  // tagName(lower) -> total daily sending volume, shown next to each campaign.
  const tagVolumeByName = useMemo(
    () =>
      new Map(realTags.map((t) => [t.tagName.toLowerCase(), t.totalDailyVolume])),
    [realTags],
  )

  const perfRows = useMemo(
    () => buildCampaignPerformance(campaigns, tagMap, tagOptions, tagVolumeByName),
    [campaigns, tagMap, tagOptions, tagVolumeByName],
  )

  const tagForecasts = useMemo(
    () => buildTagForecasts(realTags, campaigns, tagMap, emailsPerLead),
    [realTags, campaigns, tagMap, emailsPerLead],
  )

  const domainRows = useMemo(
    () => buildDomainHealthRows(domainMetrics, accounts, domainBounceRisks),
    [domainMetrics, accounts, domainBounceRisks],
  )
  const managementHealthRows = useMemo(
    () =>
      managementMetricsAvailable
        ? buildDomainHealthRows(managementDomainMetrics, accounts)
        : [],
    [accounts, managementDomainMetrics, managementMetricsAvailable],
  )

  const kpis = useMemo(() => {
    const mapped = tagForecasts.filter((t) => t.mappedCampaigns > 0)
    return {
      totalCampaigns: campaigns.length,
      unmapped: perfRows.filter((r) => !r.tagName).length,
      critical: mapped.filter((t) => t.status === 'critical').length,
      uploadSoon: mapped.filter((t) => t.status === 'upload_soon').length,
      totalDailyVolume: realTags.reduce((s, t) => s + t.totalDailyVolume, 0),
    }
  }, [campaigns, perfRows, tagForecasts, realTags])

  // Optimistically update max leads/day, reverting + surfacing the error on failure.
  const handleUpdateMaxLeads = useCallback(
    async (campaignId: number, value: number) => {
      const prev =
        campaignsRef.current.find((c) => c.campaignId === campaignId)
          ?.maxLeadsPerDay ?? null
      setCampaigns((cs) =>
        cs.map((c) =>
          c.campaignId === campaignId ? { ...c, maxLeadsPerDay: value } : c,
        ),
      )
      try {
        await updateMaxLeadsPerDay('', campaignId, value)
      } catch (e) {
        setCampaigns((cs) =>
          cs.map((c) =>
            c.campaignId === campaignId ? { ...c, maxLeadsPerDay: prev } : c,
          ),
        )
        setError(
          `Couldn't update max leads/day for campaign ${campaignId}: ${e instanceof Error ? e.message : String(e)}`,
        )
        throw e
      }
    },
    [],
  )

  // Optimistically pause/resume a campaign, reverting + surfacing errors on failure.
  const handleUpdateStatus = useCallback(
    async (campaignId: number, action: CampaignStatusAction) => {
      const prev =
        campaignsRef.current.find((c) => c.campaignId === campaignId)?.status ?? ''
      // START resumes to ACTIVE; the others map straight through.
      const next = action === 'START' ? 'ACTIVE' : action
      setCampaigns((cs) =>
        cs.map((c) =>
          c.campaignId === campaignId ? { ...c, status: next } : c,
        ),
      )
      try {
        await updateCampaignStatus('', '', campaignId, action)
      } catch (e) {
        setCampaigns((cs) =>
          cs.map((c) =>
            c.campaignId === campaignId ? { ...c, status: prev } : c,
          ),
        )
        setError(
          `Couldn't ${action === 'PAUSED' ? 'pause' : action === 'START' ? 'resume' : 'stop'} campaign ${campaignId}: ${e instanceof Error ? e.message : String(e)}`,
        )
        throw e
      }
    },
    [],
  )

  const fetchSequences = useCallback(
    (campaignId: number) => fetchCampaignSequences('', campaignId),
    [],
  )

  const fetchInbox = useCallback(
    (query: InboxQuery) => fetchCampaignInbox('', query),
    [],
  )

  const fetchEditor = useCallback(
    (campaignId: number) => fetchSequenceEditor('', campaignId),
    [],
  )

  const saveEdit = useCallback(
    (req: SequenceEditRequest) => saveSequenceEdit('', req),
    [],
  )

  const handleBulkSyncPreview = useCallback(async () => {
    const selection = buildBulkSyncSelection(campaigns, accounts)
    setBulkSyncSelection(selection)
    setBulkSyncPreviews(null)
    setBulkSyncResults(null)
    setBulkSyncError(null)
    if (selection.plan.campaigns.length === 0) {
      setBulkSyncPreviews([])
      return
    }

    setBulkSyncLoading(true)
    try {
      setBulkSyncPreviews(await previewBulkSync(selection.plan))
    } catch (e) {
      setBulkSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      setBulkSyncLoading(false)
    }
  }, [accounts, campaigns])

  const handleBulkSyncExecute = useCallback(async () => {
    if (!bulkSyncSelection || !bulkSyncPreviews) return
    const changedIds = new Set(
      bulkSyncPreviews
        .filter(
          (row) =>
            !row.error && (row.toAddCount > 0 || row.toRemoveCount > 0),
        )
        .map((row) => row.campaignId),
    )
    if (changedIds.size === 0) return

    const executionPlan = bulkSyncPlanForCampaigns(
      bulkSyncSelection.plan,
      changedIds,
    )
    setBulkSyncExecuting(true)
    setBulkSyncError(null)
    try {
      const changedResults = await executeBulkSync(executionPlan)
      const byCampaign = new Map(
        changedResults.map((result) => [result.campaignId, result]),
      )
      const allResults: BulkSyncResult[] = bulkSyncPreviews
        .filter((row) => !row.error)
        .map(
          (row) =>
            byCampaign.get(row.campaignId) ?? {
              campaignId: row.campaignId,
              campaignName: row.campaignName,
              tagName: row.tagName,
              status: 'unchanged',
              added: 0,
              removed: 0,
            },
        )
      setBulkSyncResults(allResults)
    } catch (e) {
      setBulkSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      setBulkSyncExecuting(false)
    }
  }, [bulkSyncPreviews, bulkSyncSelection])

  const closeBulkSync = useCallback(() => {
    if (bulkSyncExecuting) return
    setBulkSyncSelection(null)
    setBulkSyncPreviews(null)
    setBulkSyncResults(null)
    setBulkSyncError(null)
  }, [bulkSyncExecuting])

  return (
    <div className="min-h-full">
      <Header
        loading={
          activePage === 'campaigns'
            ? loading
            : activePage === 'domains'
              ? domainLoading
              : loading || managementLoading
        }
        lastUpdated={
          activePage === 'campaigns'
            ? lastUpdated
            : activePage === 'domains'
              ? domainLastUpdated
              : managementLastUpdated ?? lastUpdated
        }
        emailsPerLead={emailsPerLead}
        onEmailsPerLeadChange={setEmailsPerLead}
        onRefresh={
          activePage === 'campaigns'
            ? refresh
            : activePage === 'domains'
              ? refreshDomainHealth
              : refreshDomainManagementAll
        }
        onBulkSync={() => void handleBulkSyncPreview()}
        bulkSyncLoading={bulkSyncLoading || bulkSyncExecuting}
        theme={theme}
        onThemeChange={setTheme}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      <main className="mx-auto max-w-[1440px] space-y-5 px-6 py-7 lg:px-10">
        {activePage === 'campaigns' ? (
          <>
          {error && (
          <div className="flex gap-3 rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
            <span className="mt-0.5 select-none">●</span>
            <span>
              <span className="font-semibold">Failed to load data.</span>{' '}
              <span className="break-words text-critical/80">{error}</span>
            </span>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-xl border border-warn/25 bg-warn/[0.07] px-4 py-2.5 text-xs text-warn/90">
            {warnings.map((w, i) => (
              <div key={i} className="break-words">
                {w}
              </div>
            ))}
          </div>
        )}

        <SummaryCards
          totalCampaigns={kpis.totalCampaigns}
          unmapped={kpis.unmapped}
          critical={kpis.critical}
          uploadSoon={kpis.uploadSoon}
          totalDailyVolume={kpis.totalDailyVolume}
          loading={loading}
        />

        {kpis.unmapped > 0 && (
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-warn/25 bg-warn/[0.08] px-3.5 py-1.5 text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" />
              <span className="tnum font-semibold">{kpis.unmapped.toLocaleString()}</span>
              untagged in Smartlead — won't show in the forecast
            </span>
          </div>
        )}

        <TagForecastSummary
          tags={tagForecasts}
          loading={loading}
          visibleCols={tagCols}
          onColumnsChange={setTagCols}
          sentByTag={tagSends}
          reportingDate={reportingDate}
        />

        <CampaignPerformanceTable
          rows={perfRows}
          tagOptions={tagOptions}
          loading={loading}
          onUpdateMaxLeads={handleUpdateMaxLeads}
          onUpdateStatus={handleUpdateStatus}
          fetchSequences={fetchSequences}
          fetchInbox={fetchInbox}
          fetchSequenceEditor={fetchEditor}
          saveSequenceEdit={saveEdit}
          visibleCols={visibleCols}
          onColumnsChange={setVisibleCols}
        />
          </>
        ) : activePage === 'domains' ? (
          <DomainHealthPage
            rows={domainRows}
            loading={domainLoading}
            error={domainError}
            startDate={domainStartDate}
            endDate={domainEndDate}
            onStartDateChange={setDomainStartDate}
            onEndDateChange={setDomainEndDate}
            onApply={applyDomainRange}
            onPreset={applyDomainPreset}
          />
        ) : (
          <DomainManagementPage
            accounts={accounts}
            healthRows={managementHealthRows}
            blacklist={blacklistByDomain}
            blacklistLoading={blacklistLoading}
            blacklistError={blacklistError}
            loading={loading || managementLoading}
            error={managementError}
            startDate={managementStartDate}
            endDate={managementEndDate}
            onStartDateChange={setManagementStartDate}
            onEndDateChange={setManagementEndDate}
            onApply={applyManagementRange}
            onPreset={applyManagementPreset}
            onUpdate={handleDomainSettingsUpdate}
            onValidateDns={handleValidateDomainDns}
            onBulkReconnect={handleBulkReconnect}
          />
        )}
      </main>
      {bulkSyncSelection && (
        <BulkSyncModal
          selection={bulkSyncSelection}
          previews={bulkSyncPreviews}
          results={bulkSyncResults}
          loading={bulkSyncLoading}
          executing={bulkSyncExecuting}
          error={bulkSyncError}
          onPreview={() => void handleBulkSyncPreview()}
          onConfirm={() => void handleBulkSyncExecute()}
          onClose={closeBulkSync}
        />
      )}
    </div>
  )
}
