import type { CampaignComputed } from '../types'
import AlertBadge from './AlertBadge'

interface Props {
  rows: CampaignComputed[]
  selectedId: number | null
  onSelect: (campaignId: number) => void
}

function rowHighlight(row: CampaignComputed): string {
  if (row.campaign.leadStats.notStarted <= 0) return 'bg-rose-50'
  if (row.progressPercent >= 80) return 'bg-red-50'
  if (row.progressPercent >= 70) return 'bg-amber-50'
  return ''
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function daysLabel(d: number | null): string {
  if (d === null) return '—'
  return String(d)
}

export default function CampaignTable({ rows, selectedId, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-400">
          No campaigns loaded yet. Fetch campaigns or load mock data.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5">Campaign</th>
              <th className="px-3 py-2.5">ID</th>
              <th className="px-3 py-2.5">Tag</th>
              <th className="px-3 py-2.5 text-right">Leads</th>
              <th className="px-3 py-2.5 text-right">Done</th>
              <th className="px-3 py-2.5 text-right">In prog</th>
              <th className="px-3 py-2.5 text-right">Not started</th>
              <th className="px-3 py-2.5 text-right">Sent</th>
              <th className="px-3 py-2.5 text-right">Replies</th>
              <th className="px-3 py-2.5 text-right">Bounces</th>
              <th className="px-3 py-2.5 text-right">Progress</th>
              <th className="px-3 py-2.5 text-right">Camp. days</th>
              <th className="px-3 py-2.5 text-right">Tag days</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const c = row.campaign
              const selected = c.campaignId === selectedId
              return (
                <tr
                  key={c.campaignId}
                  onClick={() => onSelect(c.campaignId)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 transition hover:bg-slate-100 ${rowHighlight(
                    row,
                  )} ${selected ? 'outline outline-2 -outline-offset-2 outline-indigo-500' : ''}`}
                >
                  <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-slate-800">
                    {c.campaignName}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-400">
                    {c.campaignId}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.tagName ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {row.tagName}
                      </span>
                    ) : (
                      <span className="text-xs text-rose-500">unmapped</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmt(c.leadStats.total)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmt(c.leadStats.completed)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmt(c.leadStats.inprogress)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {fmt(c.leadStats.notStarted)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {fmt(c.sentCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                    {fmt(c.replyCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">
                    {fmt(c.bounceCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ProgressCell pct={row.progressPercent} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {daysLabel(row.campaignDaysLeft)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">
                    {daysLabel(row.sharedTagDaysLeft)}
                  </td>
                  <td className="px-3 py-2.5">
                    <AlertBadge level={row.alertLevel} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProgressCell({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-10 text-right tabular-nums text-xs text-slate-600">
        {pct}%
      </span>
    </div>
  )
}
