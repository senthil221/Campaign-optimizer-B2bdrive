import { useEffect, useState } from 'react'
import {
  PopoverCheckItem,
  PopoverEmpty,
  PopoverHeader,
  PopoverList,
  PopoverPanel,
  PopoverSearch,
} from './Popover'

export interface TagOption {
  id: string
  label: string
}

// Multi-select dropdown to filter the campaign table by tag. Empty selection
// means "no filter" (show every row) — unlike StatusFilter, where empty means
// none. The panel is portalled (see Popover) so table cards can't clip it.
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
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const sel = new Set(selected)

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

  const searchable = options.length > 9
  const needle = query.trim().toLowerCase()
  const visible =
    searchable && needle
      ? options.filter((o) => o.label.toLowerCase().includes(needle))
      : options

  return (
    <>
      <button
        ref={setAnchor}
        onClick={() => setOpen((o) => !o)}
        title="Filter campaigns by tag"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition ${
          count > 0
            ? 'border-lime/35 bg-lime/[0.08] text-lime'
            : open
              ? 'border-lime/25 bg-white/[0.05] text-ink'
              : 'border-line bg-white/[0.03] text-muted hover:border-white/15 hover:text-ink'
        }`}
      >
        {summary}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <PopoverPanel
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        align="start"
        width={240}
        label="Tag filter"
      >
        <PopoverHeader
          title="Filter by tag"
          actionLabel={count > 0 ? 'Clear' : 'Select all'}
          onAction={() => (count > 0 ? onChange([]) : toggleAll())}
        />
        {searchable && (
          <PopoverSearch
            value={query}
            onChange={setQuery}
            placeholder="Search tags…"
          />
        )}
        <PopoverList>
          {visible.length === 0 ? (
            <PopoverEmpty message="No tags match." />
          ) : (
            visible.map((o) => (
              <PopoverCheckItem
                key={o.id}
                label={o.label}
                checked={sel.has(o.id)}
                onToggle={() => toggle(o.id)}
              />
            ))
          )}
        </PopoverList>
      </PopoverPanel>
    </>
  )
}
