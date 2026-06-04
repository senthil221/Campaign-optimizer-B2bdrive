import type { CampaignStatus, TagForecast } from '../types'
import StatusBadge from './StatusBadge'

const fmt = (n: number) => n.toLocaleString()
const daysFmt = (d: number | null) => (d === null ? '—' : String(d))

const TH = 'px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint whitespace-nowrap'
const TD = 'px-5 py-3.5 whitespace-nowrap'

// Left accent rail colour by urgency.
const RAIL: Record<CampaignStatus, string> = {
  critical: 'before:bg-critical',
  upload_soon: 'before:bg-warn',
  no_capacity: 'before:bg-orange-400',
  healthy: 'before:bg-positive/60',
  unmapped: 'before:bg-transparent',
  ended: 'before:bg-transparent',
}

const daysColor = (d: number | null, status: CampaignStatus) => {
  if (d === null) return 'text-faint'
  if (status === 'critical') return 'text-critical'
  if (status === 'upload_soon') return 'text-warn'
  return 'text-ink'
}

export default function TagForecastSummary({
  tags,
  emailsPerLead,
  loading,
}: {
  tags: TagForecast[]
  emailsPerLead: number
  loading: boolean
}) {
  const rows = tags.filter((t) => t.mappedCampaigns > 0)

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-6 py-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-1 rounded-full bg-lime" />
            <h2 className="font-display text-2xl leading-none tracking-tight text-ink">
              Tag Lead Forecast
            </h2>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Leads remaining per sending tag — when{' '}
            <span className="text-ink">Days left</span> runs low, launch fresh
            campaigns on that pool.
          </p>
        </div>
        <span className="rounded-full border border-line bg-base px-3 py-1 text-[11px] font-medium text-muted">
          Demand = Not started × {emailsPerLead}
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-2 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="font-display text-xl text-muted">No mapped tags yet</p>
          <p className="mt-1 text-sm text-faint">
            Assign tags in the campaign table below to populate the forecast.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} text-left`}>Tag</th>
                <th className={`${TH} text-right`}>Campaigns</th>
                <th className={`${TH} text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Not started</th>
                <th className={`${TH} text-right`}>Demand</th>
                <th className={`${TH} text-right`}>Daily vol</th>
                <th className={`${TH} text-right`}>Days left</th>
                <th className={`${TH} text-left`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.tagName}
                  className={`group relative border-b border-line-soft transition last:border-0 hover:bg-white/[0.025] before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] ${RAIL[t.status]}`}
                >
                  <td
                    className={`${TD} max-w-[260px] truncate pl-6 font-medium text-ink`}
                    title={t.tagName}
                  >
                    {t.tagName}
                  </td>
                  <td className={`${TD} tnum text-right font-mono text-muted`}>
                    {t.mappedCampaigns}
                  </td>
                  <td className={`${TD} tnum text-right font-mono text-ink`}>
                    {fmt(t.leadsTotal)}
                  </td>
                  <td className={`${TD} tnum text-right font-mono font-semibold text-ink`}>
                    {fmt(t.notStartedTotal)}
                  </td>
                  <td className={`${TD} tnum text-right font-mono text-muted`}>
                    {fmt(t.sharedTagDemand)}
                  </td>
                  <td className={`${TD} tnum text-right font-mono text-muted`}>
                    {fmt(t.totalDailyVolume)}
                  </td>
                  <td className={`${TD} text-right`}>
                    <span
                      className={`tnum font-display text-3xl leading-none ${daysColor(
                        t.sharedTagDaysLeft,
                        t.status,
                      )}`}
                    >
                      {daysFmt(t.sharedTagDaysLeft)}
                    </span>
                  </td>
                  <td className={TD}>
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
