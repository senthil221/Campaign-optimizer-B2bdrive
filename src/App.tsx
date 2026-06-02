import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Campaign, CampaignTagMap, EmailAccount } from './types'
import { fetchEmailAccounts, loadCampaigns } from './services/smartlead'
import {
  buildTagForecasts,
  computeAllCampaigns,
  sortCampaigns,
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
import CampaignForecastTable from './components/CampaignForecastTable'
import TagVolumePanel from './components/TagVolumePanel'

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

  const computed = useMemo(
    () =>
      sortCampaigns(
        computeAllCampaigns(campaigns, realTags, tagMap, emailsPerLead),
      ),
    [campaigns, realTags, tagMap, emailsPerLead],
  )

  const tagForecasts = useMemo(
    () => buildTagForecasts(realTags, campaigns, tagMap, emailsPerLead),
    [realTags, campaigns, tagMap, emailsPerLead],
  )

  const kpis = useMemo(() => {
    let unmapped = 0
    let critical = 0
    let uploadSoon = 0
    for (const r of computed) {
      if (r.status === 'unmapped') unmapped++
      else if (r.status === 'critical') critical++
      else if (r.status === 'upload_soon') uploadSoon++
    }
    return {
      totalCampaigns: computed.length,
      unmapped,
      critical,
      uploadSoon,
      totalDailyVolume: realTags.reduce((s, t) => s + t.totalDailyVolume, 0),
    }
  }, [computed, realTags])

  const autoMappedCount = useMemo(
    () =>
      computed.filter(
        (r) => r.tagName && !tagMap[String(r.campaign.campaignId)],
      ).length,
    [computed, tagMap],
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

  const handleBulkAssign = useCallback(
    (campaignIds: number[], tagName: string) => {
      if (!tagName) return
      setTagMap((prev) => {
        const next = { ...prev }
        for (const id of campaignIds) next[String(id)] = tagName
        return next
      })
    },
    [],
  )

  return (
    <div className="min-h-full bg-[#f6f8fb]">
      <Header
        loading={loading}
        lastUpdated={lastUpdated}
        emailsPerLead={emailsPerLead}
        onEmailsPerLeadChange={setEmailsPerLead}
        onRefresh={refresh}
      />

      <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-semibold">Failed to load data.</span>{' '}
            <span className="break-words">{error}</span>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
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

        {autoMappedCount > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            <span className="font-semibold">
              {autoMappedCount.toLocaleString()} campaign
              {autoMappedCount === 1 ? '' : 's'} auto-mapped
            </span>{' '}
            from their Smartlead tags. Override any row with the inline dropdown.
          </div>
        )}

        {kpis.unmapped > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            <span className="font-semibold">
              {kpis.unmapped.toLocaleString()} campaign
              {kpis.unmapped === 1 ? '' : 's'} need tag mapping.
            </span>{' '}
            Assign a tag inline in each row, or select rows and bulk assign.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <div className="xl:col-span-3">
            <CampaignForecastTable
              rows={computed}
              tagOptions={tagOptions}
              loading={loading}
              onMapChange={handleMapChange}
              onBulkAssign={handleBulkAssign}
            />
          </div>
          <div className="xl:col-span-1">
            <TagVolumePanel tags={tagForecasts} loading={loading} />
          </div>
        </div>

        {rawSample != null && (
          <details className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
            <summary className="cursor-pointer select-none font-medium text-slate-600">
              Debug · raw campaign sample (use this to find Smartlead's tag field)
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              {JSON.stringify(rawSample, null, 2)}
            </pre>
          </details>
        )}
      </main>
    </div>
  )
}
