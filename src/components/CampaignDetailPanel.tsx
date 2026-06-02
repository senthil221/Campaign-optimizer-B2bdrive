import type { CampaignComputed } from '../types'
import { StatusBadge } from './CampaignTable'

function Row({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ?? 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  )
}

export default function CampaignDetailPanel({
  row,
}: {
  row: CampaignComputed | null
}) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2
          className="truncate text-sm font-semibold text-slate-800"
          title={c.campaignName}
        >
          {c.campaignName}
        </h2>
        <StatusBadge status={row.status} />
      </div>
      <p className="mb-3 text-xs text-slate-400">ID {c.campaignId}</p>

      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {row.statusReason}
      </div>

      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Leads
      </h3>
      <Row label="Total leads" value={ls.total.toLocaleString()} />
      <Row label="Completed" value={ls.completed.toLocaleString()} />
      <Row label="In progress" value={ls.inprogress.toLocaleString()} />
      <Row
        label="Not started"
        value={ls.notStarted.toLocaleString()}
        accent="text-slate-900"
      />
      <Row
        label="Remaining email demand"
        value={row.remainingEmailDemand.toLocaleString()}
      />

      <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Tag & depletion
      </h3>
      <Row label="Mapped tag" value={row.tagName ?? '—'} />
      <Row
        label="Tag daily volume"
        value={row.tag ? row.tag.totalDailyVolume.toLocaleString() : '—'}
      />
      <Row
        label="Campaign days left"
        value={row.campaignDaysLeft ?? '—'}
        accent="text-indigo-700"
      />
      <Row
        label="Shared tag days left"
        value={row.sharedTagDaysLeft ?? '—'}
        accent="text-indigo-700"
      />

      <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Sending
      </h3>
      <Row label="Sent" value={c.sentCount.toLocaleString()} />
      <Row
        label="Replies"
        value={c.replyCount.toLocaleString()}
        accent="text-emerald-700"
      />
      <Row label="OOO replies" value={c.oooReplyCount.toLocaleString()} />
      <Row
        label="Bounces"
        value={c.bounceCount.toLocaleString()}
        accent="text-rose-600"
      />
    </aside>
  )
}
