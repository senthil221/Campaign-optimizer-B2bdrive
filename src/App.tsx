import { useEffect, useMemo, useState } from 'react'
import type {
  Campaign,
  CampaignTagMap,
  EmailAccount,
  TagCapacity,
} from './types'
import {
  fetchCampaigns,
  fetchEmailAccounts,
  getMockAccounts,
  getMockCampaigns,
  getMockTagMap,
} from './services/smartlead'
import { buildTagCapacities, computeAllCampaigns } from './utils/calculations'
import ConnectionPanel from './components/ConnectionPanel'
import CampaignTable from './components/CampaignTable'
import CampaignStatsPanel from './components/CampaignStatsPanel'
import CampaignTagMapper from './components/CampaignTagMapper'
import TagCapacityTable from './components/TagCapacityTable'

const LS = {
  jwt: 'sl_jwt',
  apiKey: 'sl_api_key',
  emailsPerLead: 'sl_emails_per_lead',
  tagMap: 'sl_campaign_tag_map',
}

function loadTagMap(): CampaignTagMap {
  try {
    const raw = localStorage.getItem(LS.tagMap)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export default function App() {
  const [jwt, setJwt] = useState(() => localStorage.getItem(LS.jwt) ?? '')
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(LS.apiKey) ?? '',
  )
  const [emailsPerLead, setEmailsPerLead] = useState(() => {
    const v = Number(localStorage.getItem(LS.emailsPerLead))
    return Number.isFinite(v) && v >= 1 ? v : 2
  })

  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tagMap, setTagMap] = useState<CampaignTagMap>(loadTagMap)

  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usingMock, setUsingMock] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Persist settings
  useEffect(() => {
    localStorage.setItem(LS.jwt, jwt)
  }, [jwt])
  useEffect(() => {
    localStorage.setItem(LS.apiKey, apiKey)
  }, [apiKey])
  useEffect(() => {
    localStorage.setItem(LS.emailsPerLead, String(emailsPerLead))
  }, [emailsPerLead])
  useEffect(() => {
    localStorage.setItem(LS.tagMap, JSON.stringify(tagMap))
  }, [tagMap])

  const tags: TagCapacity[] = useMemo(
    () => buildTagCapacities(accounts),
    [accounts],
  )

  const computed = useMemo(
    () => computeAllCampaigns(campaigns, tags, tagMap, emailsPerLead),
    [campaigns, tags, tagMap, emailsPerLead],
  )

  const selectedRow = useMemo(
    () => computed.find((r) => r.campaign.campaignId === selectedId) ?? null,
    [computed, selectedId],
  )

  const summary = useMemo(() => {
    const counts = {
      total: computed.length,
      critical: 0,
      uploadSoon: 0,
      ended: 0,
      noCapacity: 0,
    }
    for (const r of computed) {
      if (r.alertLevel === 'critical') counts.critical++
      else if (r.alertLevel === 'upload_soon') counts.uploadSoon++
      else if (r.alertLevel === 'ended') counts.ended++
      else if (r.alertLevel === 'no_capacity') counts.noCapacity++
    }
    return counts
  }, [computed])

  async function handleFetchAccounts() {
    setError(null)
    setLoadingAccounts(true)
    try {
      const result = await fetchEmailAccounts(jwt)
      setAccounts(result)
      setUsingMock(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch accounts.')
    } finally {
      setLoadingAccounts(false)
    }
  }

  async function handleFetchCampaigns() {
    setError(null)
    setLoadingCampaigns(true)
    try {
      const result = await fetchCampaigns(jwt, apiKey || undefined)
      setCampaigns(result)
      setUsingMock(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch campaigns.')
    } finally {
      setLoadingCampaigns(false)
    }
  }

  function handleLoadMock() {
    setError(null)
    setAccounts(getMockAccounts())
    setCampaigns(getMockCampaigns())
    setTagMap((prev) => ({ ...getMockTagMap(), ...prev }))
    setUsingMock(true)
  }

  function handleMapChange(campaignId: number, tagName: string) {
    setTagMap((prev) => {
      const next = { ...prev }
      if (tagName) next[String(campaignId)] = tagName
      else delete next[String(campaignId)]
      return next
    })
  }

  function handleClearMap() {
    setTagMap({})
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1500px] px-4 py-4">
          <h1 className="text-lg font-bold text-slate-800">
            Smartlead Campaign End-Date Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Know when each campaign / tag runs out of leads — before it ends.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5">
        <ConnectionPanel
          jwt={jwt}
          apiKey={apiKey}
          emailsPerLead={emailsPerLead}
          loadingAccounts={loadingAccounts}
          loadingCampaigns={loadingCampaigns}
          usingMock={usingMock}
          error={error}
          onJwtChange={setJwt}
          onApiKeyChange={setApiKey}
          onEmailsPerLeadChange={setEmailsPerLead}
          onFetchAccounts={handleFetchAccounts}
          onFetchCampaigns={handleFetchCampaigns}
          onLoadMock={handleLoadMock}
        />

        {computed.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryCard label="Campaigns" value={summary.total} tone="slate" />
            <SummaryCard
              label="Critical"
              value={summary.critical}
              tone="red"
            />
            <SummaryCard
              label="Upload soon"
              value={summary.uploadSoon}
              tone="amber"
            />
            <SummaryCard label="Ended" value={summary.ended} tone="rose" />
            <SummaryCard
              label="No capacity"
              value={summary.noCapacity}
              tone="slate"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <CampaignTable
              rows={computed}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <TagCapacityTable tags={tags} />
          </div>

          <div className="space-y-4">
            <CampaignStatsPanel row={selectedRow} />
            <CampaignTagMapper
              campaigns={campaigns}
              tags={tags}
              tagMap={tagMap}
              onChange={handleMapChange}
              onClear={handleClearMap}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'slate' | 'red' | 'amber' | 'rose'
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-800',
    red: 'text-red-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>
        {value}
      </div>
    </div>
  )
}
