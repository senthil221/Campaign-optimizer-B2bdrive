import { useMemo, useState } from 'react'
import type { CampaignPerformance } from '../types'

interface Props {
  rows: CampaignPerformance[]
  tagOptions: string[]
  loading: boolean
  onMapChange: (campaignId: number, tagName: string) => void
  onBulkAssign: (campaignIds: number[], tagName: string) => void
}

const fmt = (n: number) => n.toLocaleString()
const pct = (n: number) => `${n.toFixed(2)}%`

const TH = 'px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint whitespace-nowrap'
const TD = 'px-4 py-2.5 whitespace-nowrap'

const inputCls =
  'h-9 rounded-lg border border-line bg-base px-3 text-sm text-ink placeholder:text-faint outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/30'

export default function CampaignPerformanceTable({
  rows,
  tagOptions,
  loading,
  onMapChange,
  onBulkAssign,
}: Props) {
  const [search, setSearch] = useState('')
  const [unmappedOnly, setUnmappedOnly] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkTag, setBulkTag] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (unmappedOnly && r.tagName) return false
      if (!q) return true
      return (
        r.campaign.campaignName.toLowerCase().includes(q) ||
        String(r.campaign.campaignId).includes(q)
      )
    })
  }, [rows, search, unmappedOnly])

  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((r) => selected.has(r.campaign.campaignId))

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected)
        filtered.forEach((r) => next.delete(r.campaign.campaignId))
      else filtered.forEach((r) => next.add(r.campaign.campaignId))
      return next
    })
  }

  function applyBulk() {
    if (!bulkTag || selected.size === 0) return
    onBulkAssign(Array.from(selected), bulkTag)
    setSelected(new Set())
    setBulkTag('')
  }

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel [animation-delay:80ms]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-6 py-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-1 rounded-full bg-lime" />
            <h2 className="font-display text-2xl leading-none tracking-tight text-ink">
              Campaign Performance
            </h2>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            <span className="text-ink">Lead Rate</span> = Interested ÷ Sent × 100.
            Assign a tag to feed the forecast above.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-6 py-3.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaign or ID…"
          className={`${inputCls} w-60`}
        />

        <button
          onClick={() => setUnmappedOnly((v) => !v)}
          className={`h-9 rounded-lg border px-3 text-xs font-medium transition ${
            unmappedOnly
              ? 'border-warn/40 bg-warn/10 text-warn'
              : 'border-line bg-base text-muted hover:text-ink'
          }`}
        >
          Unmapped only
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="tnum text-xs text-faint">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${filtered.length} shown`}
          </span>
          <select
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
            className={`${inputCls} w-44`}
          >
            <option value="">Bulk assign tag…</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulk}
            disabled={!bulkTag || selected.size === 0}
            className="h-9 rounded-lg bg-lime px-4 text-sm font-semibold text-base transition hover:bg-lime-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[64vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2">
            <tr className="border-b border-line">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="h-3.5 w-3.5 accent-lime"
                  title="Select visible"
                />
              </th>
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
                  <td colSpan={9} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-white/5" />
                  </td>
                </tr>
              ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-sm text-faint">
                  No campaigns match the current filter.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const c = r.campaign
              const isSel = selected.has(c.campaignId)
              return (
                <tr
                  key={c.campaignId}
                  className={`border-b border-line-soft transition last:border-0 hover:bg-white/[0.025] ${
                    isSel ? 'bg-lime/[0.06]' : !r.tagName ? 'bg-warn/[0.03]' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(c.campaignId)}
                      className="h-3.5 w-3.5 accent-lime"
                    />
                  </td>
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
                        r.leadRate > 0
                          ? 'bg-positive/10 text-positive'
                          : 'text-faint'
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
