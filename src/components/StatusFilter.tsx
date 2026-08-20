import { useState } from 'react'
import {
  PopoverCheckItem,
  PopoverHeader,
  PopoverList,
  PopoverPanel,
} from './Popover'

export interface StatusOption {
  id: string
  label: string
}

// Multi-select dropdown to filter the campaign table by live status. Defaults
// (set by the caller) to Active only; users tick others to reveal them. The
// panel is portalled (see Popover) so table cards can't clip it.
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
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)

  const sel = new Set(selected)

  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Preserve option order so the persisted value is stable.
    onChange(options.filter((o) => next.has(o.id)).map((o) => o.id))
  }
  const showAll = () => onChange(options.map((o) => o.id))

  const count = selected.length
  const allSelected = count === options.length
  const summary =
    count === 0
      ? 'None'
      : allSelected
        ? 'All'
        : count === 1
          ? (options.find((o) => o.id === selected[0])?.label ?? '1')
          : `${count} statuses`

  return (
    <>
      <button
        ref={setAnchor}
        onClick={() => setOpen((o) => !o)}
        title="Filter campaigns by status"
        aria-expanded={open}
        aria-haspopup="dialog"
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

      <PopoverPanel
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        align="start"
        width={208}
        label="Status filter"
      >
        <PopoverHeader
          title="Show statuses"
          actionLabel="Show all"
          onAction={showAll}
          actionDisabled={allSelected}
        />
        <PopoverList>
          {options.map((o) => (
            <PopoverCheckItem
              key={o.id}
              label={o.label}
              checked={sel.has(o.id)}
              onToggle={() => toggle(o.id)}
            />
          ))}
        </PopoverList>
      </PopoverPanel>
    </>
  )
}
