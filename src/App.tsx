import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Campaign, CampaignTagMap, EmailAccount } from './types'
import {
  fetchCampaignSequences,
  fetchEmailAccounts,
  loadCampaigns,
  updateCampaignStatus,
  updateMaxLeadsPerDay,
  type CampaignStatusAction,
} from './services/smartlead'
import {
  buildCampaignPerformance,
  buildTagForecasts,
} from './utils/campaignCalculations'
import { buildTagVolumes } from './utils/tagCapacity'
import {
  loadEmailsPerLead,
  loadTagMap,
  loadVisibleColumns,
  saveEmailsPerLead,
  saveVisibleColumns,
  PERF_COLUMNS_KEY,
  TAG_COLUMNS_KEY,
} from './utils/storage'
import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import TagForecastSummary, { TAG_COLUMNS } from './components/TagForecastSummary'
import CampaignPerformanceTable, {
  PERF_COLUMNS,
} from './components/CampaignPerformanceTable'

// Default: every column visible. Stored prefs are merged over this so a newly
// added column shows up by default for existing users.
const allVisible = (cols: readonly { id: string }[]): Record<string, boolean> =>
  Object.fromEntries(cols.map((c) => [c.id, true]))
const DEFAULT_PERF_COLUMNS: Record<string, boolean> = {
  ...allVisible(PERF_COLUMNS),
  replied: false,
  ooo: false,
  status: false,
}
const DEFAULT_TAG_COLUMNS: Record<string, boolean> = {
  ...allVisible(TAG_COLUMNS),
  demand: false,
}

export default function App() {
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

  // Latest campaigns, for reverting an optimistic edit without stale closures.
  const campaignsRef = useRef<Campaign[]>([])
  useEffect(() => {
    campaignsRef.current = campaigns
  }, [campaigns])

  // Persist user settings
  useEffect(() => saveEmailsPerLead(emailsPerLead), [emailsPerLead])
  useEffect(() => saveVisibleColumns(PERF_COLUMNS_KEY, visibleCols), [visibleCols])
  useEffect(() => saveVisibleColumns(TAG_COLUMNS_KEY, tagCols), [tagCols])

  // Credentials are injected server-side by the /api proxy → empty strings here.
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setWarnings([])
    const [accRes, campRes] = await Promise.allSettled([
      fetchEmailAccounts(''),
      loadCampaigns('', ''),
    ])

    const errs: string[] = []
    if (accRes.status === 'fulfilled') setAccounts(accRes.value)
    else errs.push(`Accounts: ${accRes.reason?.message ?? accRes.reason}`)

    if (campRes.status === 'fulfilled') {
      setCampaigns(campRes.value.campaigns)
      setWarnings(campRes.value.warnings)
    } else {
      errs.push(`Campaigns: ${campRes.reason?.message ?? campRes.reason}`)
    }

    setError(errs.length ? errs.join('  •  ') : null)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  return (
    <div className="min-h-full">
      <Header
        loading={loading}
        lastUpdated={lastUpdated}
        emailsPerLead={emailsPerLead}
        onEmailsPerLeadChange={setEmailsPerLead}
        onRefresh={refresh}
      />

      <main className="mx-auto max-w-[1440px] space-y-5 px-6 py-7 lg:px-10">
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
        />

        <CampaignPerformanceTable
          rows={perfRows}
          tagOptions={tagOptions}
          loading={loading}
          onUpdateMaxLeads={handleUpdateMaxLeads}
          onUpdateStatus={handleUpdateStatus}
          fetchSequences={fetchSequences}
          visibleCols={visibleCols}
          onColumnsChange={setVisibleCols}
        />
      </main>
    </div>
  )
}
