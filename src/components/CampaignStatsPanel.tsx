import type { CampaignComputed } from '../types'
import AlertBadge from './AlertBadge'

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${accent ?? 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}

export default function CampaignStatsPanel({
  row,
}: {
  row: CampaignComputed | null
}) {
  if (!row) {
    return (
      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Campaign detail</h2>
        <p className="mt-2 text-sm text-slate-400">
          Select a campaign row to see its depletion breakdown.
        </p>
      </aside>
    )
  }

  const c = row.campaign
  const ls = c.leadStats

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{c.campaignName}</h2>
        <AlertBadge level={row.alertLevel} />
      </div>
      <p className="mb-3 text-xs text-slate-400">
        ID {c.campaignId} ·{' '}
        {row.tagName ? `Tag: ${row.tagName}` : 'No tag mapped'}
      </p>

      <div
        className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
          row.alertLevel === 'healthy'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : row.alertLevel === 'upload_soon'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-red-200 bg-red-50 text-red-800'
        }`}
      >
        {row.alertReason}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total leads" value={ls.total.toLocaleString()} />
        <Stat label="Completed" value={ls.completed.toLocaleString()} />
        <Stat label="In progress" value={ls.inprogress.toLocaleString()} />
        <Stat
          label="Not started"
          value={ls.notStarted.toLocaleString()}
          accent="text-slate-900"
        />
        <Stat label="Sent" value={c.sentCount.toLocaleString()} />
        <Stat
          label="Replies"
          value={c.replyCount.toLocaleString()}
          accent="text-emerald-700"
        />
        <Stat
          label="Bounces"
          value={c.bounceCount.toLocaleString()}
          accent="text-rose-600"
        />
        <Stat label="Progress" value={`${row.progressPercent}%`} />
      </div>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Tag capacity
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Assigned tag"
          value={row.tagName ?? '—'}
        />
        <Stat
          label="Tag accounts"
          value={row.tag ? row.tag.accountCount : '—'}
        />
        <Stat
          label="Tag daily cap"
          value={row.tag ? row.tag.totalDailyCapacity.toLocaleString() : '—'}
        />
        <Stat
          label="Remaining demand"
          value={row.remainingEmailDemand.toLocaleString()}
        />
      </div>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Depletion
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Campaign days left"
          value={row.campaignDaysLeft ?? '—'}
          accent="text-indigo-700"
        />
        <Stat
          label="Shared tag days left"
          value={row.sharedTagDaysLeft ?? '—'}
          accent="text-indigo-700"
        />
      </div>
    </aside>
  )
}
