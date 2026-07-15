import { useEffect, useRef, useState } from 'react'

export interface TagOption {
  id: string
  label: string
}

// Multi-select dropdown to filter the campaign table by tag. Empty selection
// means "no filter" (show every row) — unlike StatusFilter, where empty means
// none. Mirrors StatusFilter's scroll/close behavior.
export default function TagFilter({
  options,
  selected,
  onChange,
}: {
  options: readonly TagOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const sel = new Set(selected)
  const on = (id: string) => sel.has(id)

  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Preserve option order so the persisted value is stable.
    onChange(options.filter((o) => next.has(o.id)).map((o) => o.id))
  }

  const allSelected = selected.length > 0 && selected.length === options.length
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.id))

  const count = selected.length
  const summary =
    count === 0
      ? 'All tags'
      : count === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? '1 tag')
        : `${count} tags`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Filter campaigns by tag"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition ${
          open
            ? 'border-lime/40 bg-lime/[0.07] text-ink'
            : 'border-line bg-white/[0.03] text-muted hover:border-white/15 hover:text-ink'
        }`}
      >
        {summary}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-line/70 bg-panel-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between border-b border-line/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              Filter by tag
            </span>
            <button
              onClick={toggleAll}
              className="text-[11px] font-semibold text-lime/80 transition hover:text-lime"
            >
              {allSelected ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {options.map((o) => {
              const checked = on(o.id)
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] transition hover:bg-white/[0.04]"
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition ${
                      checked ? 'border-lime/60 bg-lime/15' : 'border-line bg-transparent'
                    }`}
                  >
                    {checked && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="#C6F24E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    className="sr-only"
                  />
                  <span className={`truncate ${checked ? 'text-ink' : 'text-faint'}`}>{o.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
