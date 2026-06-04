import { useMemo, useState } from 'react'
import type { CampaignPerformance } from '../types'

interface Props {
  rows: CampaignPerformance[]
  tagOptions: string[]
  loading: boolean
  onMapChange: (campaignId: number, tagName: string) => void
}

const fmt = (n: number) => n.toLocaleString()
const pct = (n: number) => `${n.toFixed(2)}%`

const TH = 'px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint whitespace-nowrap'
const TD = 'px-4 py-2 whitespace-nowrap'

const inputCls =
  'h-9 rounded-lg border border-line bg-base px-3 text-sm text-ink placeholder:text-faint outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/30'

const UNMAPPED = '__unmapped__'

export default function CampaignPerformanceTable({
  rows,
  tagOptions,
  loading,
  onMapChange,
}: Props) {
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-3.5 w-1 rounded-full bg-lime" />
          <h2 className="font-display text-xl leading-none tracking-tight text-ink">
            Campaign Performance
          </h2>
          <span className="text-xs text-faint">· Lead Rate = Interested ÷ Sent</span>
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
          <option value={UNMAPPED}>— Unmapped —</option>
        </select>
        <span className="ml-auto tnum text-xs text-faint">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="max-h-[64vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2">
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Campaign</th>
              <th className={`${TH} text-left`}>Tag</th>
              <th className={`${TH} text-right`}>Sent</th>
              <th className={`${TH} text-right`}>Replied</th>
              <th className={`${TH} text-right`}>OOO</th>
              <th className={`${TH} text-right`}>Positive</th>
              <th className={`${TH} text-right`}>Lead Rate</th>
              <th className={`${TH} text-right`}>Bounced</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-line-soft">
                  <td colSpan={8} className="px-4 py-2.5">
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
                  className={`border-b border-line-soft transition last:border-0 hover:bg-white/[0.025] ${
                    r.tagName ? '' : 'bg-warn/[0.03]'
                  }`}
                >
                  <td
                    className={`${TD} max-w-[280px] truncate font-medium text-ink`}
                    title={`${c.campaignName} · #${c.campaignId}`}
                  >
                    {c.campaignName}
                  </td>
                  <td className={TD}>
                    <select
                      value={r.tagName ?? ''}
                      onChange={(e) => onMapChange(c.campaignId, e.target.value)}
                      className={`h-7 w-36 rounded-md border px-2 text-xs outline-none transition focus:border-lime/50 ${
                        r.tagName
                          ? 'border-line bg-base text-muted'
                          : 'border-warn/40 bg-warn/10 text-warn'
                      }`}
                    >
                      <option value="">— Select tag —</option>
                      {tagOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      {r.tagName && !tagOptions.includes(r.tagName) && (
                        <option value={r.tagName}>{r.tagName} (missing)</option>
                      )}
                    </select>
                  </td>
                  <td className={`${TD} tnum text-right font-mono font-semibold text-ink`}>
                    {fmt(r.sent)}
                  </td>
                  <td className={`${TD} tnum text-right font-mono text-muted`}>
                    {fmt(r.replied)}
                  </td>
                  <td className={`${TD} tnum text-right font-mono text-faint`}>
                    {fmt(r.oooReplied)}
                  </td>
                  <td className={`${TD} tnum text-right font-mono font-semibold ${
                    r.interested > 0 ? 'text-positive' : 'text-faint'
                  }`}>
                    {fmt(r.interested)}
                  </td>
                  <td className={`${TD} text-right`}>
                    <span
                      className={`tnum inline-flex min-w-[58px] justify-end rounded-md px-2 py-0.5 font-mono text-xs ${
                        r.leadRate > 0 ? 'bg-positive/10 text-positive' : 'text-faint'
                      }`}
                    >
                      {pct(r.leadRate)}
                    </span>
                  </td>
                  <td className={`${TD} tnum text-right font-mono ${
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
