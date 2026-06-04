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

const TH = 'px-3 py-2 font-medium whitespace-nowrap'
const TD = 'px-3 py-1.5 whitespace-nowrap'

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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Campaign Performance
        </h2>
        <p className="text-xs text-slate-400">
          Lead Rate = Interested ÷ Sent × 100. Assign a tag to feed the forecast
          above.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaign or ID…"
          className="h-9 w-56 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />

        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={unmappedOnly}
            onChange={(e) => setUnmappedOnly(e.target.checked)}
            className="rounded border-slate-300"
          />
          Unmapped only
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${filtered.length} shown`}
          </span>
          <select
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
            className="h-9 w-44 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
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
            className="h-9 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[68vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="rounded border-slate-300"
                  title="Select visible"
                />
              </th>
              <th className={TH}>Campaign</th>
              <th className={TH}>Tag</th>
              <th className={`${TH} text-right`}>Sent</th>
              <th className={`${TH} text-right`}>Replied</th>
              <th className={`${TH} text-right`}>OOO Replies</th>
              <th className={`${TH} text-right`}>Positive</th>
              <th className={`${TH} text-right`}>Lead Rate</th>
              <th className={`${TH} text-right`}>Bounced</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-slate-100">
                  <td colSpan={9} className="px-3 py-2.5">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-sm text-slate-400"
                >
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
                  className={`border-b border-slate-100 transition hover:bg-slate-50/80 ${
                    isSel ? '!bg-blue-50' : ''
                  } ${r.tagName ? '' : 'bg-amber-50/30'}`}
                >
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(c.campaignId)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td
                    className={`${TD} max-w-[260px] truncate font-medium text-slate-800`}
                    title={c.campaignName}
                  >
                    {c.campaignName}
                  </td>
                  <td className={TD}>
                    <select
                      value={r.tagName ?? ''}
                      onChange={(e) => onMapChange(c.campaignId, e.target.value)}
                      className={`h-7 w-36 rounded-md border px-2 text-xs outline-none focus:border-blue-500 ${
                        r.tagName
                          ? 'border-slate-300 text-slate-700'
                          : 'border-amber-300 bg-amber-50/40 text-slate-500'
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
                  <td className={`${TD} text-right font-semibold tabular-nums text-slate-800`}>
                    {fmt(r.sent)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-600`}>
                    {fmt(r.replied)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-slate-400`}>
                    {fmt(r.oooReplied)}
                  </td>
                  <td className={`${TD} text-right font-semibold tabular-nums text-emerald-700`}>
                    {fmt(r.interested)}
                  </td>
                  <td className={`${TD} text-right tabular-nums ${
                    r.leadRate > 0 ? 'font-semibold text-emerald-700' : 'text-slate-400'
                  }`}>
                    {pct(r.leadRate)}
                  </td>
                  <td className={`${TD} text-right tabular-nums ${
                    r.bounced > 0 ? 'text-red-600' : 'text-slate-400'
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
