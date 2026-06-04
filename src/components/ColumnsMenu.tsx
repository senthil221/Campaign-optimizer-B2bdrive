import { useEffect, useRef, useState } from 'react'

export interface ColumnDef {
  id: string
  label: string
}

// Dropdown of checkboxes to show/hide table columns. Generic over a column
// list so any table can reuse it. Closes on outside click / Esc. A column is
// visible unless explicitly set to false (so new columns default to shown).
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
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${
          open || hiddenCount > 0
            ? 'border-lime/40 bg-lime/[0.06] text-ink'
            : 'border-line bg-base text-muted hover:text-ink'
        }`}
      >
        <span className="text-xs">▥</span>
        Columns
        {hiddenCount > 0 && (
          <span className="tnum rounded-full bg-lime/15 px-1.5 text-[10px] font-semibold text-lime">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-panel-2 shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              Show columns
            </span>
            <button
              onClick={showAll}
              className="text-[11px] font-semibold text-lime hover:underline"
            >
              Reset
            </button>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {columns.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm text-ink transition hover:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={show(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-3.5 w-3.5 accent-lime"
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
