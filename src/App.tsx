import { useEffect, useMemo, useState } from 'react'
import type { Campaign, CampaignTagMap, EmailAccount, TagVolume } from './types'
import {
  fetchEmailAccounts,
  loadCampaigns,
} from './services/smartlead'
import {
  computeAllCampaigns,
  sortCampaigns,
} from './utils/campaignCalculations'
import { buildTagVolumes } from './utils/tagCapacity'
import ConnectionPanel from './components/ConnectionPanel'
import SummaryCards from './components/SummaryCards'
import CampaignTable from './components/CampaignTable'
import TagVolumeTable from './components/TagVolumeTable'
import CampaignDetailPanel from './components/CampaignDetailPanel'
import CampaignTagMapper from './components/CampaignTagMapper'

const LS = {
  jwt: 'sl_jwt',
  emailsPerLead: 'sl_emails_per_lead',
  tagMap: 'sl_campaign_tag_map',
}

function loadTagMap(): CampaignTagMap {
  try {
    const raw = localStorage.getItem(LS.tagMap)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseManualIds(input: string): number[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  )
}

export default function App() {
  const [jwt, setJwt] = useState(() => localStorage.getItem(LS.jwt) ?? '')
  const [emailsPerLead, setEmailsPerLead] = useState(() => {
    const v = Number(localStorage.getItem(LS.emailsPerLead))
    return Number.isFinite(v) && v >= 1 ? v : 2
  })
  const [manualIds, setManualIds] = useState('')

  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tagMap, setTagMap] = useState<CampaignTagMap>(loadTagMap)

  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Persist settings
  useEffect(() => void localStorage.setItem(LS.jwt, jwt), [jwt])
  useEffect(
    () => void localStorage.setItem(LS.emailsPerLead, String(emailsPerLead)),
    [emailsPerLead],
  )
  useEffect(
    () => void localStorage.setItem(LS.tagMap, JSON.stringify(tagMap)),
    [tagMap],
  )

  const tags: TagVolume[] = useMemo(
    () => buildTagVolumes(accounts),
    [accounts],
  )

  const computed = useMemo(
    () =>
      sortCampaigns(
        computeAllCampaigns(campaigns, tags, tagMap, emailsPerLead),
      ),
    [campaigns, tags, tagMap, emailsPerLead],
  )

  const selectedRow = useMemo(
    () => computed.find((r) => r.campaign.campaignId === selectedId) ?? null,
    [computed, selectedId],
  )

  const summary = useMemo(() => {
    let critical = 0
    let uploadSoon = 0
    for (const r of computed) {
      if (r.status === 'critical') critical++
      else if (r.status === 'upload_soon') uploadSoon++
    }
    const totalDailyVolume = tags
      .filter((t) => t.tagName !== 'Untagged')
      .reduce((sum, t) => sum + t.totalDailyVolume, 0)
    return {
      totalCampaigns: computed.length,
      totalTags: tags.filter((t) => t.tagName !== 'Untagged').length,
      totalDailyVolume,
      critical,
      uploadSoon,
    }
  }, [computed, tags])

  async function handleFetchAccounts() {
    setError(null)
    setLoadingAccounts(true)
    try {
      const result = await fetchEmailAccounts(jwt)
      setAccounts(result)
      if (result.length === 0) {
        setWarnings((w) => [
          ...w.filter((x) => !x.startsWith('No email accounts')),
          'No email accounts returned. Check your JWT or that accounts are in use.',
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch accounts.')
    } finally {
      setLoadingAccounts(false)
    }
  }

  async function handleFetchCampaigns() {
    setError(null)
    setWarnings([])
    setLoadingCampaigns(true)
    try {
      const ids = parseManualIds(manualIds)
      const result = await loadCampaigns(jwt, ids.length > 0 ? ids : undefined)
      setCampaigns(result.campaigns)
      setWarnings(result.warnings)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch campaigns.')
    } finally {
      setLoadingCampaigns(false)
    }
  }

  function handleMapChange(campaignId: number, tagName: string) {
    setTagMap((prev) => {
      const next = { ...prev }
      if (tagName) next[String(campaignId)] = tagName
      else delete next[String(campaignId)]
      return next
    })
  }

  function handleBulkAssign(campaignIds: number[], tagName: string) {
    if (!tagName) return
    setTagMap((prev) => {
      const next = { ...prev }
      for (const id of campaignIds) next[String(id)] = tagName
      return next
    })
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-4 py-3">
          <h1 className="text-base font-bold text-slate-800">
            Smartlead Campaign Lead-Count Dashboard
          </h1>
          <p className="text-xs text-slate-500">
            Real campaign lead stats and tag sending volume — know when each
            campaign runs out of leads.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <ConnectionPanel
          jwt={jwt}
          emailsPerLead={emailsPerLead}
          manualIds={manualIds}
          loadingAccounts={loadingAccounts}
          loadingCampaigns={loadingCampaigns}
          accountCount={accounts.length}
          campaignCount={campaigns.length}
          error={error}
          warnings={warnings}
          onJwtChange={setJwt}
          onEmailsPerLeadChange={setEmailsPerLead}
          onManualIdsChange={setManualIds}
          onFetchAccounts={handleFetchAccounts}
          onFetchCampaigns={handleFetchCampaigns}
        />

        {computed.length > 0 && (
          <SummaryCards
            totalCampaigns={summary.totalCampaigns}
            totalTags={summary.totalTags}
            totalDailyVolume={summary.totalDailyVolume}
            uploadSoon={summary.uploadSoon}
            critical={summary.critical}
          />
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <div className="space-y-4 xl:col-span-3">
            <CampaignTable
              rows={computed}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <TagVolumeTable tags={tags} />
          </div>

          <div className="space-y-4">
            <CampaignDetailPanel row={selectedRow} />
            <CampaignTagMapper
              campaigns={campaigns}
              tags={tags}
              tagMap={tagMap}
              onChange={handleMapChange}
              onBulkAssign={handleBulkAssign}
              onClear={() => setTagMap({})}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
