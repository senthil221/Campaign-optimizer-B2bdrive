import type { TagVolume } from '../types'

export default function TagVolumeTable({ tags }: { tags: TagVolume[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-700">
          Tag sending volume
        </h2>
      </div>
      {tags.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">
          No tags loaded. Click “Fetch accounts / tags”.
        </p>
      ) : (
        <div className="max-h-[40vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 text-right font-medium">Accounts</th>
                <th className="px-3 py-2 text-right font-medium">Daily vol</th>
                <th className="px-3 py-2 text-right font-medium">Used today</th>
                <th className="px-3 py-2 text-right font-medium">Remaining</th>
                <th className="px-3 py-2 text-right font-medium">Avg warmup</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr
                  key={t.tagName}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {t.tagName}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {t.accountCount}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {t.totalDailyVolume.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                    {t.usedToday.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                    {t.remainingToday.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                    {t.avgWarmupReputation || '—'}
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
