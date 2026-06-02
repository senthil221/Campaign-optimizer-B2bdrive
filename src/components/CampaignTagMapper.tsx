import { useMemo, useState } from 'react'
import type { Campaign, CampaignTagMap, TagVolume } from '../types'

interface Props {
  campaigns: Campaign[]
  tags: TagVolume[]
  tagMap: CampaignTagMap
  onChange: (campaignId: number, tagName: string) => void
  onBulkAssign: (campaignIds: number[], tagName: string) => void
  onClear: () => void
}

export default function CampaignTagMapper({
  campaigns,
  tags,
  tagMap,
  onChange,
  onBulkAssign,
  onClear,
}: Props) {
  const [campaignQuery, setCampaignQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkTag, setBulkTag] = useState('')

  const tagOptions = useMemo(() => {
    const names = tags.map((t) => t.tagName)
    if (!tagQuery.trim()) return names
    const q = tagQuery.toLowerCase()
    return names.filter((n) => n.toLowerCase().includes(q))
  }, [tags, tagQuery])

  const filtered = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase()
    return campaigns.filter((c) => {
      if (onlyUnmapped && tagMap[String(c.campaignId)]) return false
      if (!q) return true
      return (
        c.campaignName.toLowerCase().includes(q) ||
        String(c.campaignId).includes(q)
      )
    })
  }, [campaigns, campaignQuery, onlyUnmapped, tagMap])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.campaignId))

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        filtered.forEach((c) => next.delete(c.campaignId))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((c) => next.add(c.campaignId))
      return next
    })
  }

  function applyBulk() {
    if (!bulkTag || selected.size === 0) return
    onBulkAssign(Array.from(selected), bulkTag)
    setSelected(new Set())
  }

  if (campaigns.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Campaign → Tag mapping
        </h2>
        <p className="text-sm text-slate-400">
          Load campaigns to map them to tags.
        </p>
      </section>
    )
  }

  const unmappedCount = campaigns.filter(
    (c) => !tagMap[String(c.campaignId)],
  ).length

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Campaign → Tag mapping
        </h2>
        <button
          onClick={onClear}
          className="text-xs font-medium text-slate-400 hover:text-rose-600"
        >
          Clear all
        </button>
      </div>

      {/* Filters */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          value={campaignQuery}
          onChange={(e) => setCampaignQuery(e.target.value)}
          placeholder="Search campaign / ID"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <input
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Search tag"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={onlyUnmapped}
            onChange={(e) => setOnlyUnmapped(e.target.checked)}
            className="rounded border-slate-300"
          />
          Only unmapped ({unmappedCount})
        </label>
        <span>{filtered.length} shown</span>
      </div>

      {/* Bulk assign bar */}
      <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 p-2">
        <input
          type="checkbox"
          checked={allFilteredSelected}
          onChange={toggleAll}
          className="rounded border-slate-300"
          title="Select all shown"
        />
        <span className="text-xs text-slate-500">{selected.size} sel.</span>
        <select
          value={bulkTag}
          onChange={(e) => setBulkTag(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
        >
          <option value="">Assign tag…</option>
          {tagOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          onClick={applyBulk}
          disabled={!bulkTag || selected.size === 0}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      {/* Rows */}
      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {filtered.map((c) => {
          const current = tagMap[String(c.campaignId)] ?? ''
          const isFreeText = current !== '' && !tagOptions.includes(current)
          return (
            <div
              key={c.campaignId}
              className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={selected.has(c.campaignId)}
                onChange={() => toggle(c.campaignId)}
                className="rounded border-slate-300"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-slate-700">
                  {c.campaignName}
                </div>
                <div className="text-[10px] text-slate-400">
                  ID {c.campaignId}
                </div>
              </div>
              <select
                value={isFreeText ? '__custom__' : current}
                onChange={(e) => {
                  if (e.target.value === '__custom__') return
                  onChange(c.campaignId, e.target.value)
                }}
                className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
              >
                <option value="">— none —</option>
                {tagOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {isFreeText && (
                  <option value="__custom__">{current} (custom)</option>
                )}
              </select>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-3 text-center text-xs text-slate-400">
            No campaigns match.
          </p>
        )}
      </div>
    </section>
  )
}
