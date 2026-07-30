import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Campaign,
  CampaignTagMap,
  DomainHealthMetric,
  EmailAccount,
} from './types'
import {
  fetchCampaignInbox,
  fetchCampaignSequences,
  fetchEmailAccounts,
  fetchDomainHealthMetrics,
  fetchTagSendPerformance,
  fetchSequenceEditor,
  loadCampaigns,
  saveSequenceEdit,
  updateCampaignStatus,
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
import { buildDomainHealthRows } from './utils/domainHealth'

// Default: every column visible. Stored prefs are merged over this so a newly
// added column shows up by default for existing users.
const allVisible = (cols: readonly { id: string }[]): Record<string, boolean> =>
  Object.fromEntries(cols.map((c) => [c.id, true]))
const DEFAULT_PERF_COLUMNS: Record<string, boolean> = {
  ...allVisible(PERF_COLUMNS),
  ooo: false,
  status: false,
}
const DEFAULT_TAG_COLUMNS: Record<string, boolean> = {
  ...allVisible(TAG_COLUMNS),
  demand: false,
}

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

function getPreviousIstDate(now = new Date()): string {
  return getIstDateOffset(1, now)
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
  const [domainStartDate, setDomainStartDate] = useState(getPreviousIstDate)
  const [domainEndDate, setDomainEndDate] = useState(getPreviousIstDate)
  const [domainMetrics, setDomainMetrics] = useState<DomainHealthMetric[]>([])
  const [domainLoading, setDomainLoading] = useState(false)
  const [domainLoaded, setDomainLoaded] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainLastUpdated, setDomainLastUpdated] = useState<Date | null>(null)

  // Latest campaigns, for reverting an optimistic edit without stale closures.
  const campaignsRef = useRef<Campaign[]>([])
  useEffect(() => {
    campaignsRef.current = campaigns
  }, [campaigns])

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

  const loadDomainHealth = useCallback(async (
    startDate: string,
    endDate: string,
    refreshAccounts: boolean,
  ) => {
    if (!startDate || !endDate || startDate > endDate) {
      return
    }
    setDomainLoading(true)
    setDomainError(null)
    const [accountsResult, metricsResult] = await Promise.allSettled([
      refreshAccounts ? fetchEmailAccounts('') : Promise.resolve(null),
      fetchDomainHealthMetrics('', startDate, endDate),
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

    setDomainError(failures.length > 0 ? failures.join('  •  ') : null)
    setDomainLoaded(true)
    setDomainLastUpdated(new Date())
    setDomainLoading(false)
  }, [])

  const refreshDomainHealth = useCallback(
    () => loadDomainHealth(domainStartDate, domainEndDate, true),
    [domainEndDate, domainStartDate, loadDomainHealth],
  )

  const applyDomainRange = useCallback(
    () => loadDomainHealth(domainStartDate, domainEndDate, false),
    [domainEndDate, domainStartDate, loadDomainHealth],
  )

  const applyDomainPreset = useCallback(
    (days: 1 | 3) => {
      const now = new Date()
      const endDate = getIstDateOffset(0, now)
      const startDate = getIstDateOffset(days - 1, now)
      setDomainStartDate(startDate)
      setDomainEndDate(endDate)
      void loadDomainHealth(startDate, endDate, false)
    },
    [loadDomainHealth],
  )

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
    () => buildDomainHealthRows(domainMetrics, accounts),
    [domainMetrics, accounts],
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

  return (
    <div className="min-h-full">
      <Header
        loading={activePage === 'campaigns' ? loading : domainLoading}
        lastUpdated={
          activePage === 'campaigns' ? lastUpdated : domainLastUpdated
        }
        emailsPerLead={emailsPerLead}
        onEmailsPerLeadChange={setEmailsPerLead}
        onRefresh={
          activePage === 'campaigns' ? refresh : refreshDomainHealth
        }
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
        ) : (
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
        )}
      </main>
    </div>
  )
}
