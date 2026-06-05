import { useEffect, useRef, useState } from 'react'

export interface StatusOption {
  id: string
  label: string
}

// Multi-select dropdown to filter the campaign table by live status. Defaults
// (set by the caller) to Active only; users tick others to reveal them.
// Closes on outside click / Esc, mirroring ColumnsMenu.
export default function StatusFilter({
  options,
  selected,
  onChange,
}: {
  options: readonly StatusOption[]
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
  const showAll = () => onChange(options.map((o) => o.id))

  const count = selected.length
  const summary =
    count === 0
      ? 'None'
      : count === options.length
        ? 'All'
        : count === 1
          ? (options.find((o) => o.id === selected[0])?.label ?? '1')
          : `${count} statuses`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Filter campaigns by status"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition ${
          open
            ? 'border-lime/40 bg-lime/[0.07] text-ink'
            : 'border-line bg-transparent text-faint hover:border-white/15 hover:text-muted'
        }`}
      >
        {/* Funnel icon */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M1 1.5h10L7 6.5v4L5 9.5v-3L1 1.5Z"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        Status: {summary}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-line/70 bg-panel-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between border-b border-line/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              Show statuses
            </span>
            <button
              onClick={showAll}
              className="text-[11px] font-semibold text-lime/80 transition hover:text-lime"
            >
              Show all
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
                  <span className={checked ? 'text-ink' : 'text-faint'}>{o.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
