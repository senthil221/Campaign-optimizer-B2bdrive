import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Campaign, CampaignTagMap, EmailAccount } from './types'
import { fetchEmailAccounts, loadCampaigns } from './services/smartlead'
import {
  buildCampaignPerformance,
  buildTagForecasts,
} from './utils/campaignCalculations'
import { buildTagVolumes } from './utils/tagCapacity'
import {
  loadEmailsPerLead,
  loadTagMap,
  saveEmailsPerLead,
  saveTagMap,
} from './utils/storage'
import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import TagForecastSummary from './components/TagForecastSummary'
import CampaignPerformanceTable from './components/CampaignPerformanceTable'

export default function App() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tagMap, setTagMap] = useState<CampaignTagMap>(loadTagMap)
  const [emailsPerLead, setEmailsPerLead] = useState<number>(loadEmailsPerLead)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [rawSample, setRawSample] = useState<unknown>(null)

  // Persist user settings
  useEffect(() => saveTagMap(tagMap), [tagMap])
  useEffect(() => saveEmailsPerLead(emailsPerLead), [emailsPerLead])

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
      setRawSample(campRes.value.rawSample)
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

  const perfRows = useMemo(
    () => buildCampaignPerformance(campaigns, tagMap, tagOptions),
    [campaigns, tagMap, tagOptions],
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

  const autoMappedCount = useMemo(
    () =>
      perfRows.filter(
        (r) => r.tagName && !tagMap[String(r.campaign.campaignId)],
      ).length,
    [perfRows, tagMap],
  )

  // ---- Mapping handlers (instant recalc via state) ----
  const handleMapChange = useCallback((campaignId: number, tagName: string) => {
    setTagMap((prev) => {
      const next = { ...prev }
      if (tagName) next[String(campaignId)] = tagName
      else delete next[String(campaignId)]
      return next
    })
  }, [])

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

        {(autoMappedCount > 0 || kpis.unmapped > 0) && (
          <div className="flex flex-wrap gap-2 text-[13px]">
            {autoMappedCount > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full border border-positive/25 bg-positive/[0.08] px-3.5 py-1.5 text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                <span className="font-semibold tnum">{autoMappedCount.toLocaleString()}</span>
                auto-mapped from Smartlead tags
              </span>
            )}
            {kpis.unmapped > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full border border-warn/25 bg-warn/[0.08] px-3.5 py-1.5 text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                <span className="font-semibold tnum">{kpis.unmapped.toLocaleString()}</span>
                need a tag — assign below to forecast
              </span>
            )}
          </div>
        )}

        <TagForecastSummary
          tags={tagForecasts}
          emailsPerLead={emailsPerLead}
          loading={loading}
        />

        <CampaignPerformanceTable
          rows={perfRows}
          tagOptions={tagOptions}
          loading={loading}
          onMapChange={handleMapChange}
        />

        {rawSample != null && (
          <details className="rounded-xl border border-line bg-panel px-4 py-2.5 text-xs text-muted">
            <summary className="cursor-pointer select-none font-medium text-faint transition hover:text-muted">
              Debug · raw campaign sample (find Smartlead's tag field)
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-line-soft bg-base p-3 font-mono text-[11px] leading-relaxed text-muted">
              {JSON.stringify(rawSample, null, 2)}
            </pre>
          </details>
        )}
      </main>
    </div>
  )
}
