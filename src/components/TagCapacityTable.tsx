import type { TagCapacity } from '../types'

export default function TagCapacityTable({ tags }: { tags: TagCapacity[] }) {
  if (tags.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Tag capacity
        </h2>
        <p className="text-sm text-slate-400">
          No tags loaded. Fetch accounts or load mock data.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Tag capacity</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Tag</th>
              <th className="px-2 py-2 text-right">Accounts</th>
              <th className="px-2 py-2 text-right">Daily capacity</th>
              <th className="px-2 py-2 text-right">Used today</th>
              <th className="px-2 py-2 text-right">Remaining</th>
              <th className="px-2 py-2 text-right">Avg warmup</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr
                key={t.tagName}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-2 py-2 font-medium text-slate-800">
                  {t.tagName}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {t.accountCount}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {t.totalDailyCapacity.toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                  {t.usedToday.toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-700">
                  {t.remainingToday.toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {t.avgWarmupReputation || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
