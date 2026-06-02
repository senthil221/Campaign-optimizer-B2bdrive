import type { Campaign, CampaignTagMap, TagCapacity } from '../types'

interface Props {
  campaigns: Campaign[]
  tags: TagCapacity[]
  tagMap: CampaignTagMap
  onChange: (campaignId: number, tagName: string) => void
  onClear: () => void
}

export default function CampaignTagMapper({
  campaigns,
  tags,
  tagMap,
  onChange,
  onClear,
}: Props) {
  if (campaigns.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Campaign → Tag mapping
        </h2>
        <p className="text-sm text-slate-400">
          Load campaigns to map them to tags.
        </p>
      </section>
    )
  }

  const tagOptions = tags.map((t) => t.tagName)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
      <p className="mb-3 text-xs text-slate-400">
        Smartlead analytics may not return a tag. Map each campaign manually —
        saved to your browser (localStorage).
      </p>

      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {campaigns.map((c) => {
          const current = tagMap[String(c.campaignId)] ?? ''
          const isFreeText = current !== '' && !tagOptions.includes(current)
          return (
            <div
              key={c.campaignId}
              className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-700">
                  {c.campaignName}
                </div>
                <div className="text-[11px] text-slate-400">
                  ID {c.campaignId}
                </div>
              </div>
              <select
                value={isFreeText ? '__custom__' : current}
                onChange={(e) => {
                  if (e.target.value === '__custom__') return
                  onChange(c.campaignId, e.target.value)
                }}
                className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
      </div>
    </section>
  )
}
