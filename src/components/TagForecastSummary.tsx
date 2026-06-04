import type { TagForecast } from '../types'
import StatusBadge from './StatusBadge'

const fmt = (n: number) => n.toLocaleString()
const daysFmt = (d: number | null) => (d === null ? '—' : String(d))

const TH = 'px-4 py-2.5 font-medium whitespace-nowrap'
const TD = 'px-4 py-2.5 whitespace-nowrap'

export default function TagForecastSummary({
  tags,
  emailsPerLead,
  loading,
}: {
  tags: TagForecast[]
  emailsPerLead: number
  loading: boolean
}) {
  // Only tags that actually have campaigns mapped to them are actionable here.
  const rows = tags.filter((t) => t.mappedCampaigns > 0)

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            Tag Lead Forecast
          </h2>
          <p className="text-xs text-slate-400">
            Leads remaining per tag — when “Days left” gets low, launch new
            campaigns on that tag.
          </p>
        </div>
        <span className="text-xs text-slate-400">
          Demand = Not started × {emailsPerLead} emails/lead
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">
          No tags have campaigns mapped yet. Assign tags in the campaign table
          below.
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                <th className={TH}>Tag</th>
                <th className={`${TH} text-right`}>Campaigns</th>
                <th className={`${TH} text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Not started</th>
                <th className={`${TH} text-right`}>Demand</th>
                <th className={`${TH} text-right`}>Daily volume</th>
                <th className={`${TH} text-right`}>Days left</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.tagName}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                >
                  <td
                    className={`${TD} max-w-[220px] truncate font-medium text-slate-800`}
                    title={t.tagName}
                  >
                    {t.tagName}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>
                    {t.mappedCampaigns}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-700`}>
                    {fmt(t.leadsTotal)}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>
                    {fmt(t.notStartedTotal)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-600`}>
                    {fmt(t.sharedTagDemand)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-600`}>
                    {fmt(t.totalDailyVolume)}
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="text-base font-bold tabular-nums text-slate-900">
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
