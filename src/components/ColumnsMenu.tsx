import { useEffect, useRef, useState } from 'react'

export interface ColumnDef {
  id: string
  label: string
}

// Dropdown of checkboxes to show/hide table columns. Generic over a column
// list so any table can reuse it. Closes on outside click / Esc.
export default function ColumnsMenu({
  columns,
  visibleCols,
  onColumnsChange,
}: {
  columns: readonly ColumnDef[]
  visibleCols: Record<string, boolean>
  onColumnsChange: (next: Record<string, boolean>) => void
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

  const show = (id: string) => visibleCols[id] !== false
  const hiddenCount = columns.filter((c) => !show(c.id)).length

  const toggle = (id: string) =>
    onColumnsChange({ ...visibleCols, [id]: !show(id) })
  const showAll = () =>
    onColumnsChange(Object.fromEntries(columns.map((c) => [c.id, true])))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Customize visible columns"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition ${
          open
            ? 'border-lime/40 bg-lime/[0.07] text-ink'
            : 'border-line bg-transparent text-faint hover:border-white/15 hover:text-muted'
        }`}
      >
        {/* Grid icon */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1" />
          <rect x="7" y="0.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1" />
          <rect x="0.5" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1" />
          <rect x="7" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1" />
        </svg>
        Columns
        {hiddenCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-lime/20 px-1 text-[10px] font-bold text-lime">
            {hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-line/70 bg-panel-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between border-b border-line/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              Show / hide
            </span>
            <button
              onClick={showAll}
              className="text-[11px] font-semibold text-lime/80 transition hover:text-lime"
            >
              Reset all
            </button>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {columns.map((c) => {
              const visible = show(c.id)
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] transition hover:bg-white/[0.04]"
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition ${
                      visible
                        ? 'border-lime/60 bg-lime/15'
                        : 'border-line bg-transparent'
                    }`}
                  >
                    {visible && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="#C6F24E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggle(c.id)}
                    className="sr-only"
                  />
                  <span className={visible ? 'text-ink' : 'text-faint'}>{c.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
