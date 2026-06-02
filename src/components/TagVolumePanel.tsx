import type { TagForecast } from '../types'

const fmt = (n: number) => n.toLocaleString()

export default function TagVolumePanel({
  tags,
  loading,
}: {
  tags: TagForecast[]
  loading: boolean
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Tag volume</h2>
        <p className="text-xs text-slate-400">
          Daily sending pools — shared days show how fast each pool depletes.
        </p>
      </div>

      {loading && tags.length === 0 ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">No tags loaded.</p>
      ) : (
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 text-right font-medium">Acct</th>
                <th className="px-3 py-2 text-right font-medium">Daily vol</th>
                <th className="px-3 py-2 text-right font-medium">Used</th>
                <th className="px-3 py-2 text-right font-medium">Remain</th>
                <th className="px-3 py-2 text-right font-medium">Camp.</th>
                <th className="px-3 py-2 text-right font-medium">Shared days</th>
                <th className="px-3 py-2 text-right font-medium">Warmup</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => {
                const depleted = t.remainingToday <= 0
                return (
                  <tr
                    key={t.tagName}
                    className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                      depleted ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <td
                      className="max-w-[140px] truncate px-3 py-1.5 font-medium text-slate-800"
                      title={t.tagName}
                    >
                      {t.tagName}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {t.accountCount}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                      {fmt(t.totalDailyVolume)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {fmt(t.usedToday)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        depleted ? 'font-semibold text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {fmt(t.remainingToday)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {t.mappedCampaigns || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {t.sharedTagDaysLeft === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="font-bold tabular-nums text-slate-900">
                          {t.sharedTagDaysLeft}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {t.avgWarmupReputation || '—'}
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
