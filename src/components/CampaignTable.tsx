import type { CampaignComputed, CampaignStatus } from '../types'

const STATUS_META: Record<
  CampaignStatus,
  { label: string; badge: string }
> = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  upload_soon: {
    label: 'Upload soon',
    badge: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
  no_capacity: {
    label: 'No capacity',
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  },
  healthy: {
    label: 'Healthy',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  ended: {
    label: 'Ended',
    badge: 'bg-slate-200 text-slate-700 ring-slate-500/30',
  },
}

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.badge}`}
    >
      {meta.label}
    </span>
  )
}

interface Props {
  rows: CampaignComputed[]
  selectedId: number | null
  onSelect: (campaignId: number) => void
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function days(d: number | null): string {
  return d === null ? '—' : String(d)
}

function rowAccent(row: CampaignComputed): string {
  switch (row.status) {
    case 'critical':
      return 'border-l-2 border-l-red-500'
    case 'upload_soon':
      return 'border-l-2 border-l-amber-500'
    case 'ended':
      return 'border-l-2 border-l-slate-300'
    default:
      return 'border-l-2 border-l-transparent'
  }
}

const TH = 'px-3 py-2 font-medium'
const TD = 'px-3 py-1.5 whitespace-nowrap'

export default function CampaignTable({ rows, selectedId, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-400">
          No campaigns loaded. Enter your JWT and click “Fetch campaigns”.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
            <tr>
              <th className={TH}>Campaign</th>
              <th className={TH}>ID</th>
              <th className={TH}>Tag</th>
              <th className={`${TH} text-right`}>Leads</th>
              <th className={`${TH} text-right`}>Done</th>
              <th className={`${TH} text-right`}>In prog</th>
              <th className={`${TH} text-right`}>Not started</th>
              <th className={`${TH} text-right`}>Demand</th>
              <th className={`${TH} text-right`}>Tag vol</th>
              <th className={`${TH} text-right`}>Camp days</th>
              <th className={`${TH} text-right`}>Tag days</th>
              <th className={`${TH} text-right`}>Sent</th>
              <th className={`${TH} text-right`}>Replies</th>
              <th className={`${TH} text-right`}>Bounces</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const c = row.campaign
              const ls = c.leadStats
              const selected = c.campaignId === selectedId
              return (
                <tr
                  key={c.campaignId}
                  onClick={() => onSelect(c.campaignId)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 ${rowAccent(
                    row,
                  )} ${selected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <td
                    className={`${TD} max-w-[240px] truncate font-medium text-slate-800`}
                    title={c.campaignName}
                  >
                    {c.campaignName}
                    {c.nameMissing && (
                      <span className="ml-1 text-[10px] text-amber-600">
                        (name?)
                      </span>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums text-slate-400`}>
                    {c.campaignId}
                  </td>
                  <td className={TD}>
                    {row.tagName ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {row.tagName}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {fmt(ls.total)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {fmt(ls.completed)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {fmt(ls.inprogress)}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>
                    {fmt(ls.notStarted)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {fmt(row.remainingEmailDemand)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {row.tag ? fmt(row.tag.totalDailyVolume) : '—'}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {days(row.campaignDaysLeft)}
                  </td>
                  <td className={`${TD} text-right font-bold tabular-nums text-slate-900`}>
                    {days(row.sharedTagDaysLeft)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {fmt(c.sentCount)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {fmt(c.replyCount)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {fmt(c.bounceCount)}
                  </td>
                  <td className={TD}>
                    <StatusBadge status={row.status} />
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
