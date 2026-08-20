import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// Popovers render in a portal on document.body with fixed positioning so no
// ancestor's `overflow-hidden` (every table card has one) can clip them. The
// panel is re-anchored on scroll/resize instead of closing, and flips above the
// trigger when the space below runs out.

const GAP = 6
const VIEWPORT_MARGIN = 10
const MIN_HEIGHT = 176
const DEFAULT_MIN_WIDTH = 216

export type PopoverAlign = 'start' | 'end'

interface PanelPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
  flipped: boolean
}

function computePosition(
  anchor: HTMLElement,
  align: PopoverAlign,
  width: number | undefined,
  minWidth: number,
): PanelPosition {
  const rect = anchor.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight

  const panelWidth = Math.min(
    width ?? Math.max(rect.width, minWidth),
    viewportWidth - VIEWPORT_MARGIN * 2,
  )
  const rawLeft = align === 'end' ? rect.right - panelWidth : rect.left
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, rawLeft),
    viewportWidth - panelWidth - VIEWPORT_MARGIN,
  )

  const spaceBelow = viewportHeight - rect.bottom - GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN
  const flipped = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow

  // Clamp the vertical offset so a trigger sitting at (or past) the edge of the
  // viewport still gets a panel that is fully on screen.
  const maxOffset = Math.max(
    VIEWPORT_MARGIN,
    viewportHeight - VIEWPORT_MARGIN - MIN_HEIGHT,
  )
  const offset = Math.min(
    Math.max(
      VIEWPORT_MARGIN,
      flipped ? viewportHeight - rect.top + GAP : rect.bottom + GAP,
    ),
    maxOffset,
  )

  return {
    left,
    top: flipped ? undefined : offset,
    bottom: flipped ? offset : undefined,
    width: panelWidth,
    maxHeight: Math.max(120, viewportHeight - offset - VIEWPORT_MARGIN),
    flipped,
  }
}

/**
 * Floating panel anchored to `anchor`. Callers own the trigger button and the
 * `open` state; pass the button element itself (e.g. `ref={setAnchor}` with a
 * `useState` setter) so the panel can measure it.
 */
export function PopoverPanel({
  anchor,
  open,
  onClose,
  align = 'end',
  width,
  minWidth = DEFAULT_MIN_WIDTH,
  label,
  children,
}: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  align?: PopoverAlign
  width?: number
  minWidth?: number
  label?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PanelPosition | null>(null)

  const reposition = useCallback(() => {
    if (!anchor) return
    setPosition(computePosition(anchor, align, width, minWidth))
  }, [align, anchor, minWidth, width])

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPosition(null)
      return
    }
    reposition()
    // Capture phase catches scrolls in any nested container, not just the page.
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [anchor, open, reposition])

  useEffect(() => {
    if (!open) return
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [anchor, onClose, open])

  if (!open || !position) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        width: position.width,
        maxHeight: position.maxHeight,
      }}
      className={`z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-elevated/95 shadow-[0_24px_64px_-18px_rgba(0,0,0,0.7)] backdrop-blur-xl ${
        position.flipped ? 'animate-pop-up' : 'animate-pop'
      }`}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Title row with an optional right-aligned action (Clear / Select all). */
export function PopoverHeader({
  title,
  actionLabel,
  onAction,
  actionDisabled = false,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        {title}
      </span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="text-[11px] font-semibold text-lime/80 transition hover:text-lime disabled:cursor-not-allowed disabled:text-faint/60"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/** Filter box for long option lists. */
export function PopoverSearch({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
}) {
  return (
    <div className="shrink-0 border-b border-line/70 p-2">
      <input
        autoFocus
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 w-full rounded-md border border-line bg-panel-2 px-2 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/50"
      />
    </div>
  )
}

/** Scrollable option area; keeps wheel events from leaking to the page. */
export function PopoverList({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
      {children}
    </div>
  )
}

export function PopoverEmpty({ message }: { message: string }) {
  return (
    <p className="px-3 py-6 text-center text-[11px] text-faint">{message}</p>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition ${
        checked ? 'border-lime/60 bg-lime/20' : 'border-line bg-transparent'
      }`}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
          <path
            d="M1.5 4L3.5 6L6.5 2"
            stroke="rgb(var(--color-lime))"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}

/** Checkbox row used by every multi-select menu. */
export function PopoverCheckItem({
  label,
  checked,
  onToggle,
  meta,
  swatch,
}: {
  label: string
  checked: boolean
  onToggle: () => void
  meta?: ReactNode
  swatch?: string
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      title={label}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition hover:bg-white/[0.05] ${
        checked ? 'text-ink' : 'text-muted'
      }`}
    >
      <CheckBox checked={checked} />
      {swatch && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: swatch }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-[10px] text-faint">{meta}</span>}
    </button>
  )
}

/** Row that clears the filter — the "All items" entry at the top of a menu. */
export function PopoverAllItem({
  label,
  active,
  onSelect,
}: {
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <div className="shrink-0 border-b border-line/70 p-1">
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition hover:bg-white/[0.05] ${
          active ? 'text-lime' : 'text-muted'
        }`}
      >
        <span className="truncate">{label}</span>
        {active && <span className="text-[10px]">✓</span>}
      </button>
    </div>
  )
}
