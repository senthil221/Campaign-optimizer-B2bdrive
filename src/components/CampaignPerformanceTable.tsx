import { useMemo, useState } from 'react'
import type { CampaignPerformance } from '../types'

interface Props {
  rows: CampaignPerformance[]
  tagOptions: string[]
  loading: boolean
}

const fmt = (n: number) => n.toLocaleString()
const pct = (n: number) => `${n.toFixed(2)}%`

const TH = 'px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint whitespace-nowrap align-middle'
const TD = 'px-4 py-2.5 whitespace-nowrap align-middle tnum tabular-nums'

const inputCls =
  'h-9 rounded-xl border border-line bg-base px-3 text-sm text-ink placeholder:text-faint outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/25'

const UNMAPPED = '__unmapped__'

export default function CampaignPerformanceTable({ rows, tagOptions, loading }: Props) {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('') // '' = all, UNMAPPED, or a tag

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (tagFilter === UNMAPPED && r.tagName) return false
      if (tagFilter && tagFilter !== UNMAPPED && r.tagName !== tagFilter) return false
      if (!q) return true
      return (
        r.campaign.campaignName.toLowerCase().includes(q) ||
        String(r.campaign.campaignId).includes(q)
      )
    })
  }, [rows, search, tagFilter])

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel [animation-delay:80ms]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-4 w-[3px] rounded-full bg-lime" />
          <h2 className="font-display text-[19px] font-semibold leading-none tracking-[-0.01em] text-ink">
            Campaign Performance
          </h2>
          <span className="text-[12px] font-medium text-faint">
            Lead Rate = Interested ÷ Sent
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaign or ID…"
          className={`${inputCls} w-56`}
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className={`${inputCls} w-48`}
        >
          <option value="">All tags</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={UNMAPPED}>— Untagged —</option>
        </select>
        <span className="ml-auto tnum text-xs font-medium text-faint">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="max-h-[64vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2">
            <tr className="border-b border-line">
              <th className={`${TH} pl-5 text-left`}>Campaign</th>
              <th className={`${TH} text-left`}>Tag</th>
              <th className={`${TH} text-right`}>Sent</th>
              <th className={`${TH} text-right`}>Replied</th>
              <th className={`${TH} text-right`}>OOO</th>
              <th className={`${TH} text-right`}>Positive</th>
              <th className={`${TH} text-right`}>Lead Rate</th>
              <th className={`${TH} pr-5 text-right`}>Bounced</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-line-soft">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-white/5" />
                  </td>
                </tr>
              ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center text-sm text-faint">
                  No campaigns match the current filter.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const c = r.campaign
              return (
                <tr
                  key={c.campaignId}
                  className="border-b border-line-soft transition last:border-0 hover:bg-white/[0.022]"
                >
                  <td
                    className="max-w-[300px] truncate px-4 py-2.5 pl-5 align-middle font-medium text-ink"
                    title={`${c.campaignName} · #${c.campaignId}`}
                  >
                    {c.campaignName}
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    {r.tagName ? (
                      <span className="inline-flex max-w-[160px] items-center gap-1.5 truncate rounded-md border border-line bg-white/[0.03] px-2 py-0.5 text-xs font-medium text-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime/70" />
                        <span className="truncate">{r.tagName}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-faint">Untagged</span>
                    )}
                  </td>
                  <td className={`${TD} text-right font-semibold text-ink`}>{fmt(r.sent)}</td>
                  <td className={`${TD} text-right text-muted`}>{fmt(r.replied)}</td>
                  <td className={`${TD} text-right text-faint`}>{fmt(r.oooReplied)}</td>
                  <td className={`${TD} text-right font-semibold ${
                    r.interested > 0 ? 'text-positive' : 'text-faint'
                  }`}>
                    {fmt(r.interested)}
                  </td>
                  <td className={`${TD} text-right`}>
                    <span
                      className={`tnum inline-flex min-w-[56px] justify-end rounded-md px-2 py-0.5 text-xs font-semibold ${
                        r.leadRate > 0 ? 'bg-positive/10 text-positive' : 'text-faint'
                      }`}
                    >
                      {pct(r.leadRate)}
                    </span>
                  </td>
                  <td className={`${TD} pr-5 text-right ${
                    r.bounced > 0 ? 'text-critical' : 'text-faint'
                  }`}>
                    {fmt(r.bounced)}
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
