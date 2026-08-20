import { useState } from 'react'
import {
  PopoverCheckItem,
  PopoverHeader,
  PopoverList,
  PopoverPanel,
} from './Popover'

export interface ColumnDef {
  id: string
  label: string
}

// Dropdown of checkboxes to show/hide table columns. Generic over a column
// list so any table can reuse it. The panel is portalled (see Popover) so
// table cards can't clip it.
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
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)

  const show = (id: string) => visibleCols[id] !== false
  const hiddenCount = columns.filter((c) => !show(c.id)).length

  const toggle = (id: string) =>
    onColumnsChange({ ...visibleCols, [id]: !show(id) })
  const showAll = () =>
    onColumnsChange(Object.fromEntries(columns.map((c) => [c.id, true])))

  return (
    <>
      <button
        ref={setAnchor}
        onClick={() => setOpen((o) => !o)}
        title="Customize visible columns"
        aria-expanded={open}
        aria-haspopup="dialog"
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

      <PopoverPanel
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        width={224}
        label="Column visibility"
      >
        <PopoverHeader
          title="Show / hide"
          actionLabel="Reset all"
          onAction={showAll}
          actionDisabled={hiddenCount === 0}
        />
        <PopoverList>
          {columns.map((c) => (
            <PopoverCheckItem
              key={c.id}
              label={c.label}
              checked={show(c.id)}
              onToggle={() => toggle(c.id)}
            />
          ))}
        </PopoverList>
      </PopoverPanel>
    </>
  )
}
