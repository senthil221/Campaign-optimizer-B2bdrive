import type { CampaignStatus, TagForecast } from '../types'
import StatusBadge from './StatusBadge'

const fmt = (n: number) => n.toLocaleString()
const daysFmt = (d: number | null) => (d === null ? '—' : String(d))

const TH = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint whitespace-nowrap align-middle'
const TD = 'px-3 py-1.5 whitespace-nowrap align-middle tnum tabular-nums text-[13px]'

// Left accent border on the first cell (avoids positioning the <tr>, which
// shifts table columns in Chrome).
const RAIL: Record<CampaignStatus, string> = {
  critical: 'border-l-critical',
  upload_soon: 'border-l-warn',
  no_capacity: 'border-l-orange-400',
  healthy: 'border-l-positive/45',
  unmapped: 'border-l-transparent',
  ended: 'border-l-transparent',
}

const daysColor = (d: number | null, status: CampaignStatus) => {
  if (d === null) return 'text-faint'
  if (status === 'critical') return 'text-critical'
  if (status === 'upload_soon') return 'text-warn'
  return 'text-ink'
}

const repColor = (r: number) =>
  r === 0 ? 'text-faint' : r >= 90 ? 'text-positive' : r >= 75 ? 'text-warn' : 'text-critical'

export default function TagForecastSummary({
  tags,
  emailsPerLead,
  loading,
}: {
  tags: TagForecast[]
  emailsPerLead: number
  loading: boolean
}) {
  const rows = [...tags].sort((a, b) => {
    const da = a.sharedTagDaysLeft
    const db = b.sharedTagDaysLeft
    if (da === null && db === null) return b.totalDailyVolume - a.totalDailyVolume
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-3.5 w-[3px] rounded-full bg-lime" />
          <h2 className="font-display text-[17px] font-semibold leading-none tracking-[-0.01em] text-ink">
            Tag Overview
          </h2>
          <span className="text-[11px] font-medium text-faint">
            forecast &amp; sending health
          </span>
        </div>
        <span className="rounded-full border border-line bg-base px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Demand = Not started × {emailsPerLead}
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded-md bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-faint">
          No sending tags found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} pl-5 text-left`}>Tag</th>
                <th className={`${TH} border-l border-line text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Not started</th>
                <th className={`${TH} text-right`}>Demand</th>
                <th className={`${TH} text-right`}>Days left</th>
                <th className={`${TH} pl-4 text-left`}>Status</th>
                <th className={`${TH} border-l border-line text-right`}>Accts</th>
                <th className={`${TH} text-right`}>Volume</th>
                <th className={`${TH} text-right`}>Used</th>
                <th className={`${TH} text-right`}>Unused</th>
                <th className={`${TH} text-right`}>Avg rep</th>
                <th className={`${TH} pr-5 text-right`}>Disc.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const idle = t.mappedCampaigns === 0
                return (
                  <tr
                    key={t.tagName}
                    className="border-b border-line-soft transition last:border-0 hover:bg-white/[0.022]"
                  >
                    <td
                      className={`max-w-[200px] truncate border-l-[3px] px-3 py-1.5 pl-[17px] align-middle text-[13px] font-medium text-ink ${RAIL[t.status]}`}
                      title={`${t.tagName} · ${t.mappedCampaigns} campaign(s)`}
                    >
                      {t.tagName}
                    </td>
                    <td className={`${TD} border-l border-line text-right text-ink`}>
                      {idle ? <span className="text-faint">—</span> : fmt(t.leadsTotal)}
                    </td>
                    <td className={`${TD} text-right font-semibold text-ink`}>
                      {idle ? <span className="font-normal text-faint">—</span> : fmt(t.notStartedTotal)}
                    </td>
                    <td className={`${TD} text-right text-muted`}>
                      {idle ? <span className="text-faint">—</span> : fmt(t.sharedTagDemand)}
                    </td>
                    <td className={`${TD} text-right`}>
                      <span
                        className={`tnum font-display text-[19px] font-semibold leading-none tracking-[-0.01em] ${daysColor(
                          t.sharedTagDaysLeft,
                          t.status,
                        )}`}
                      >
                        {daysFmt(t.sharedTagDaysLeft)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 pl-4 align-middle">
                      {idle ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-faint ring-1 ring-inset ring-line">
                          <span className="h-1.5 w-1.5 rounded-full bg-faint/60" />
                          Idle
                        </span>
                      ) : (
                        <StatusBadge status={t.status} />
                      )}
                    </td>
                    <td className={`${TD} border-l border-line text-right text-muted`}>
                      {t.accountCount}
                    </td>
                    <td className={`${TD} text-right font-semibold text-ink`}>
                      {fmt(t.totalDailyVolume)}
                    </td>
                    <td className={`${TD} text-right text-muted`}>{fmt(t.usedToday)}</td>
                    <td
                      className={`${TD} text-right ${
                        t.remainingToday <= 0 ? 'text-critical' : 'text-positive'
                      }`}
                    >
                      {fmt(t.remainingToday)}
                    </td>
                    <td className={`${TD} text-right ${repColor(t.avgWarmupReputation)}`}>
                      {t.avgWarmupReputation || '—'}
                    </td>
                    <td
                      className={`${TD} pr-5 text-right ${
                        t.disconnects > 0 ? 'font-semibold text-critical' : 'text-faint'
                      }`}
                    >
                      {t.disconnects > 0 ? t.disconnects : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
