import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { DomainBounceRisk, DomainHealthRow } from '../types'
import { isValidDomain } from '../utils/domainManagement'
import { EmailProviderIcons } from './EmailProviderIcon'

const fmt = (value: number) => value.toLocaleString()
const pct = (value: number) => `${value.toFixed(2)}%`
const IST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const TH =
  'whitespace-nowrap px-3 py-2.5 text-[9px] font-medium uppercase tracking-[0.1em] text-muted/80'
const TD = 'whitespace-nowrap px-3 py-2 text-[12px] tnum'

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back for browsers that expose the API but deny direct access.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('Clipboard access is unavailable')
}

function normalizePastedDomain(value: string): string {
  let domain = value.trim().toLowerCase()
  if (domain.includes('@')) domain = domain.slice(domain.lastIndexOf('@') + 1)
  domain = domain.replace(/^https?:\/\//, '').split('/')[0]
  return domain.replace(/^@/, '').replace(/[.,]+$/, '')
}

type SortKey =
  | 'domain'
  | 'client'
  | 'accountCount'
  | 'messagePerDay'
  | 'sent'
  | 'bounced'
  | 'bounceRate'
  | 'replied'
  | 'replyRate'
  | 'avgWarmupReputation'
  | 'dnsStatus'
  | 'inboxRisk'

type SortDirection = 'asc' | 'desc'

function inboxRiskTitle(row: DomainHealthRow): string {
  const risk = row.inboxRisk
  if (!risk) return 'No matching sender-infrastructure bounce detected.'
  const categorySummary = risk.categories
    .map((category) => `${category.label}: ${category.count}`)
    .join(', ')
  const sample = risk.samples[0]
  return [
    categorySummary,
    `Affected inboxes: ${risk.inboxes.join(', ')}`,
    sample?.diagnostic ? `Latest diagnostic: ${sample.diagnostic}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function riskTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

function InboxRiskBadge({
  domain,
  risk,
  open,
  onOpenChange,
}: {
  domain: string
  risk: DomainBounceRisk
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const [position, setPosition] = useState({ left: 12, top: 12 })

  const updatePosition = () => {
    const button = buttonRef.current
    const popover = popoverRef.current
    if (!button || !popover) return

    const gap = 8
    const viewportPadding = 12
    const buttonRect = button.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    const left = Math.min(
      Math.max(viewportPadding, buttonRect.right - popoverRect.width),
      window.innerWidth - popoverRect.width - viewportPadding,
    )
    const roomBelow = window.innerHeight - buttonRect.bottom - viewportPadding
    const top =
      roomBelow >= popoverRect.height + gap
        ? buttonRect.bottom + gap
        : Math.max(viewportPadding, buttonRect.top - popoverRect.height - gap)

    setPosition({ left, top })
  }

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open])

  useEffect(() => {
    if (!open) return

    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !buttonRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        onOpenChange(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
        buttonRef.current?.focus()
      }
    }
    const closeOnResize = () => onOpenChange(false)
    const closeOnOutsideScroll = (event: Event) => {
      const target = event.target
      if (
        target instanceof Node &&
        popoverRef.current?.contains(target)
      ) {
        return
      }
      onOpenChange(false)
    }

    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnResize)
    window.addEventListener('scroll', closeOnOutsideScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnResize)
      window.removeEventListener('scroll', closeOnOutsideScroll, true)
    }
  }, [open, onOpenChange])

  const latestSample = risk.samples[0]

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Show inbox risk details for ${domain}: ${risk.total} events across ${risk.affectedInboxes} inboxes`}
        className={`inline-flex items-center gap-1.5 rounded-full bg-critical/10 px-2.5 py-1 text-[10px] font-medium text-critical ring-1 ring-inset ring-critical/25 transition hover:bg-critical/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-critical/70 ${
          open ? 'bg-critical/15 ring-critical/50' : ''
        }`}
        title="Click to view inbox risk details"
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">!</span>
        <span>{fmt(risk.total)}</span>
        <span aria-hidden="true" className="text-critical/55">
          /
        </span>
        <span>{fmt(risk.affectedInboxes)}</span>
        <span
          aria-hidden="true"
          className={`ml-0.5 text-[8px] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▼
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={`Inbox risk details for ${domain}`}
            className="fixed z-[100] w-[min(340px,calc(100vw-24px))] whitespace-normal rounded-xl border border-critical/25 bg-panel p-4 text-left shadow-2xl shadow-black/40"
            style={{ left: position.left, top: position.top }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-critical">
                  Inbox risk
                </div>
                <div className="mt-1 truncate text-[13px] font-semibold text-ink">
                  {domain}
                </div>
              </div>
              <button
                type="button"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-base text-muted transition hover:bg-white/[0.05] hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-critical/60"
                aria-label="Close inbox risk details"
                onClick={() => {
                  onOpenChange(false)
                  buttonRef.current?.focus()
                }}
              >
                ×
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted">
                  Risk events
                </div>
                <div className="tnum mt-0.5 text-[17px] font-semibold text-critical">
                  {fmt(risk.total)}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted">
                  Affected inboxes
                </div>
                <div className="tnum mt-0.5 text-[17px] font-semibold text-critical">
                  {fmt(risk.affectedInboxes)}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                Reasons
              </div>
              <div className="mt-1.5 space-y-1.5">
                {risk.categories.map((category) => (
                  <div
                    key={category.category}
                    className="flex items-center justify-between gap-3 rounded-lg bg-critical/[0.07] px-2.5 py-1.5"
                  >
                    <span className="text-[11px] text-ink">
                      {category.label}
                    </span>
                    <span className="tnum text-[11px] font-semibold text-critical">
                      {fmt(category.count)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                Affected inboxes
              </div>
              <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto pr-1">
                {risk.inboxes.map((inbox) => (
                  <div
                    key={inbox}
                    className="truncate rounded-md bg-white/[0.035] px-2.5 py-1.5 text-[10px] text-muted"
                    title={inbox}
                  >
                    {inbox}
                  </div>
                ))}
              </div>
            </div>

            {latestSample?.diagnostic && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Latest diagnostic
                  </span>
                  {risk.latestAt && (
                    <span className="text-[9px] text-faint">
                      {riskTimestamp(risk.latestAt)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 max-h-20 overflow-y-auto break-words text-[10px] leading-relaxed text-muted">
                  {latestSample.diagnostic}
                </p>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  align = 'right',
  className = '',
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  direction: SortDirection
  align?: 'left' | 'right'
  className?: string
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === activeKey
  return (
    <th
      className={`${TH} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      aria-sort={
        active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition hover:text-ink ${
          align === 'right' ? 'justify-end' : 'justify-start'
        }`}
        title={`Sort by ${label}`}
      >
        {label}
        <span
          aria-hidden="true"
          className={`text-[10px] ${active ? 'text-lime' : 'text-faint/70'}`}
        >
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function SummaryStat({
  label,
  value,
  tone = 'ink',
}: {
  label: string
  value: string
  tone?: 'ink' | 'lime' | 'positive' | 'warn' | 'critical'
}) {
  const color = {
    ink: 'text-ink',
    lime: 'text-lime',
    positive: 'text-positive',
    warn: 'text-warn',
    critical: 'text-critical',
  }[tone]
  return (
    <div className="min-w-[145px] flex-1 px-5 py-3">
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted/80">
        {label}
      </div>
      <div
        className={`tnum mt-1 text-[20px] font-semibold tracking-[-0.01em] ${color}`}
      >
        {value}
      </div>
    </div>
  )
}

export default function DomainHealthPage({
  rows,
  loading,
  error,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onPreset,
}: {
  rows: DomainHealthRow[]
  loading: boolean
  error: string | null
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onApply: () => void
  onPreset: (days: 1 | 3 | 7) => void
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('bounceRate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [openRiskDomain, setOpenRiskDomain] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pastedDomains, setPastedDomains] = useState('')
  const [pasteMode, setPasteMode] = useState<'add' | 'remove'>('add')
  const [copyNotice, setCopyNotice] = useState<{
    message: string
    error: boolean
  } | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const selectionAnchorRef = useRef<string | null>(null)
  const validRange = Boolean(startDate && endDate && startDate <= endDate)
  const now = new Date()
  const today = IST_DATE_FORMAT.format(now)
  const threeDaysAgo = IST_DATE_FORMAT.format(
    new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
  )
  const sevenDaysAgo = IST_DATE_FORMAT.format(
    new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
  )
  const activePreset =
    startDate === today && endDate === today
      ? 'today'
      : startDate === threeDaysAgo && endDate === today
        ? '3d'
        : startDate === sevenDaysAgo && endDate === today
          ? '7d'
          : null

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? rows.filter(
          (row) =>
            row.domain.includes(query) ||
            row.tagNames.some((tagName) =>
              tagName.toLowerCase().includes(query),
            ) ||
            row.inboxRisk?.inboxes.some((inbox) =>
              inbox.toLowerCase().includes(query),
            ),
        )
      : rows

    const valueFor = (row: DomainHealthRow): string | number => {
      switch (sortKey) {
        case 'domain':
          return row.domain
        case 'client':
          return row.tagNames.join(', ')
        case 'accountCount':
          return row.accountCount
        case 'messagePerDay':
          return row.messagePerDay
        case 'sent':
          return row.sent
        case 'bounced':
          return row.bounced
        case 'bounceRate':
          return row.bounceRate
        case 'replied':
          return row.replied
        case 'replyRate':
          return row.replyRate
        case 'avgWarmupReputation':
          return row.avgWarmupReputation ?? -1
        case 'dnsStatus':
          return row.missingDns.length
        case 'inboxRisk':
          return row.inboxRisk?.total ?? 0
      }
    }

    return [...filtered].sort((a, b) => {
      const aValue = valueFor(a)
      const bValue = valueFor(b)
      const comparison =
        typeof aValue === 'string' && typeof bValue === 'string'
          ? aValue.localeCompare(bValue)
          : Number(aValue) - Number(bValue)
      return (
        comparison * (sortDirection === 'asc' ? 1 : -1) ||
        a.domain.localeCompare(b.domain)
      )
    })
  }, [rows, search, sortDirection, sortKey])

  useEffect(() => {
    const availableDomains = new Set(rows.map((row) => row.domain))
    setSelected(
      (current) =>
        new Set(
          Array.from(current).filter((domain) => availableDomains.has(domain)),
        ),
    )
  }, [rows])

  const selectedDomains = useMemo(
    () =>
      rows
        .filter((row) => selected.has(row.domain))
        .map((row) => row.domain)
        .sort((a, b) => a.localeCompare(b)),
    [rows, selected],
  )
  const pastedDomainResult = useMemo(() => {
    const parsed = Array.from(
      new Set(
        pastedDomains
          .split(/[\s,;]+/)
          .map(normalizePastedDomain)
          .filter(Boolean),
      ),
    )
    const loadedDomains = new Set(rows.map((row) => row.domain))
    return {
      invalid: parsed.filter((domain) => !isValidDomain(domain)),
      matched: parsed.filter(
        (domain) => isValidDomain(domain) && loadedDomains.has(domain),
      ),
      unmatched: parsed.filter(
        (domain) => isValidDomain(domain) && !loadedDomains.has(domain),
      ),
    }
  }, [pastedDomains, rows])
  const selectedVisibleCount = visibleRows.reduce(
    (count, row) => count + (selected.has(row.domain) ? 1 : 0),
    0,
  )
  const allVisibleSelected =
    visibleRows.length > 0 && selectedVisibleCount === visibleRows.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedVisibleCount > 0 && !allVisibleSelected
    }
  }, [allVisibleSelected, selectedVisibleCount])

  useEffect(() => {
    if (!copyNotice) return
    const timeout = window.setTimeout(() => setCopyNotice(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [copyNotice])

  const totals = useMemo(() => {
    const sent = rows.reduce((sum, row) => sum + row.sent, 0)
    const replied = rows.reduce((sum, row) => sum + row.replied, 0)
    const bounced = rows.reduce((sum, row) => sum + row.bounced, 0)
    return {
      sent,
      replyRate: sent > 0 ? (replied / sent) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
      dnsValidated: rows.filter((row) => row.dnsValidated).length,
      riskDomains: rows.filter((row) => row.inboxRisk).length,
      riskInboxes: rows.reduce(
        (sum, row) => sum + (row.inboxRisk?.affectedInboxes ?? 0),
        0,
      ),
    }
  }, [rows])

  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'domain' || key === 'client' ? 'asc' : 'desc')
  }

  const selectDomain = (
    domain: string,
    checked: boolean,
    shiftKey: boolean,
  ) => {
    const targetIndex = visibleRows.findIndex((row) => row.domain === domain)
    const anchorIndex = selectionAnchorRef.current
      ? visibleRows.findIndex(
          (row) => row.domain === selectionAnchorRef.current,
        )
      : -1

    setSelected((current) => {
      const next = new Set(current)
      const range =
        shiftKey && anchorIndex >= 0 && targetIndex >= 0
          ? visibleRows.slice(
              Math.min(anchorIndex, targetIndex),
              Math.max(anchorIndex, targetIndex) + 1,
            )
          : visibleRows.filter((row) => row.domain === domain)

      for (const row of range) {
        if (checked) next.add(row.domain)
        else next.delete(row.domain)
      }
      return next
    })
    selectionAnchorRef.current = domain
  }

  const toggleVisible = () => {
    selectionAnchorRef.current = null
    setSelected((current) => {
      const next = new Set(current)
      for (const row of visibleRows) {
        if (allVisibleSelected) next.delete(row.domain)
        else next.add(row.domain)
      }
      return next
    })
  }

  const applyPastedSelection = () => {
    if (pastedDomainResult.matched.length === 0) return
    selectionAnchorRef.current = null
    setSelected((current) => {
      const next = new Set(current)
      for (const domain of pastedDomainResult.matched) {
        if (pasteMode === 'remove') next.delete(domain)
        else next.add(domain)
      }
      return next
    })
    setPasteOpen(false)
    setPastedDomains('')
  }

  const copyDomains = async (domains: string[]) => {
    if (domains.length === 0) return
    try {
      await copyText(domains.join('\n'))
      setCopyNotice({
        message:
          domains.length === 1
            ? `Copied ${domains[0]}`
            : `Copied ${domains.length.toLocaleString()} domains`,
        error: false,
      })
    } catch {
      setCopyNotice({
        message: 'Could not copy. Please allow clipboard access and try again.',
        error: true,
      })
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (validRange && !loading) onApply()
  }

  return (
    <div className="space-y-5">
      <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-[22px] w-[3px] rounded-full bg-lime" />
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
                Domain Health
              </h2>
            </div>
            <p className="mt-1.5 pl-6 text-[11px] text-muted">
              Sending performance, capacity, warmup reputation, and DNS by
              domain
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <div>
              <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                Quick range
              </span>
              <div className="flex h-9 overflow-hidden rounded-lg border border-line bg-panel-2 p-0.5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onPreset(1)}
                  className={`rounded-md px-3 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    activePreset === 'today'
                      ? 'bg-lime-fill text-[#18200c] shadow-sm'
                      : 'text-muted hover:bg-panel hover:text-ink'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onPreset(3)}
                  className={`rounded-md px-3 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    activePreset === '3d'
                      ? 'bg-lime-fill text-[#18200c] shadow-sm'
                      : 'text-muted hover:bg-panel hover:text-ink'
                  }`}
                >
                  3D
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onPreset(7)}
                  className={`rounded-md px-3 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    activePreset === '7d'
                      ? 'bg-lime-fill text-[#18200c] shadow-sm'
                      : 'text-muted hover:bg-panel hover:text-ink'
                  }`}
                >
                  7D
                </button>
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                Start date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="h-9 rounded-lg border border-line bg-panel-2 px-3 text-[12px] font-medium text-ink outline-none transition focus:border-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                End date
              </span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="h-9 rounded-lg border border-line bg-panel-2 px-3 text-[12px] font-medium text-ink outline-none transition focus:border-lime/60"
              />
            </label>
            <button
              type="submit"
              disabled={!validRange || loading}
              className="h-9 rounded-lg bg-lime-fill px-4 text-[12px] font-semibold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </form>
        </div>

        {!validRange && (
          <div className="border-b border-critical/20 bg-critical/10 px-5 py-2 text-xs text-critical">
            End date must be on or after the start date.
          </div>
        )}
        {error && (
          <div className="border-b border-critical/20 bg-critical/10 px-5 py-3 text-xs text-critical">
            <span className="font-semibold">
              Could not load domain health.
            </span>{' '}
            {error}
          </div>
        )}

        <div className="flex divide-x divide-line overflow-x-auto">
          <SummaryStat label="Domains" value={fmt(rows.length)} />
          <SummaryStat
            label="Emails sent"
            value={fmt(totals.sent)}
            tone="lime"
          />
          <SummaryStat
            label="Bounce rate"
            value={pct(totals.bounceRate)}
            tone={
              totals.bounceRate > 3
                ? 'critical'
                : totals.bounceRate > 1
                  ? 'warn'
                  : 'positive'
            }
          />
          <SummaryStat
            label="Reply rate"
            value={pct(totals.replyRate)}
            tone="positive"
          />
          <SummaryStat
            label="DNS validated"
            value={`${totals.dnsValidated}/${rows.length}`}
            tone={
              totals.dnsValidated === rows.length && rows.length > 0
                ? 'positive'
              : 'warn'
            }
          />
          <SummaryStat
            label="Risk domains / inboxes"
            value={`${totals.riskDomains} / ${totals.riskInboxes}`}
            tone={totals.riskDomains > 0 ? 'critical' : 'positive'}
          />
        </div>
      </section>

      <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="h-[18px] w-[3px] rounded-full bg-lime" />
            <h3 className="text-[14px] font-semibold text-ink">
              Domain Overview
            </h3>
            <span className="text-[11px] text-muted">
              {startDate === endDate
                ? startDate
                : `${startDate} → ${endDate}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {copyNotice && (
              <span
                role="status"
                className={`text-[10px] font-medium ${
                  copyNotice.error ? 'text-critical' : 'text-positive'
                }`}
              >
                {copyNotice.message}
              </span>
            )}
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[10px] font-medium text-muted transition hover:border-lime/30 hover:text-ink"
            >
              <span className="text-critical">▣</span>
              Paste to select
            </button>
            {selectedDomains.length > 0 && (
              <>
                <span className="tnum rounded-md bg-lime/[0.08] px-2 py-1 text-[10px] font-medium text-lime">
                  {selectedDomains.length.toLocaleString()} selected
                </span>
                <button
                  type="button"
                  onClick={() => void copyDomains(selectedDomains)}
                  className="h-8 rounded-lg bg-lime-fill px-3 text-[10px] font-semibold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover"
                >
                  Copy selected
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectionAnchorRef.current = null
                    setSelected(new Set())
                  }}
                  className="h-8 rounded-lg border border-line px-2.5 text-[10px] font-medium text-muted transition hover:text-ink"
                >
                  Clear
                </button>
              </>
            )}
            <span className="hidden text-[10px] text-faint xl:inline">
              Shift-click checkboxes to select a range
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search domain or client…"
              className="h-8 w-52 rounded-lg border border-line bg-panel-2 px-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/60"
            />
            <span className="tnum text-[11px] text-muted">
              {visibleRows.length}/{rows.length}
            </span>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-9 animate-pulse rounded-lg bg-white/[0.04]"
              />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-muted">
            {search
              ? 'No domains or clients match your search.'
              : 'No domain data found for this date range.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="w-11 px-4 py-2.5">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisible}
                      aria-label="Select all visible domains"
                      className="h-3.5 w-3.5 accent-lime"
                    />
                  </th>
                  <SortHeader
                    label="Domain"
                    sortKey="domain"
                    activeKey={sortKey}
                    direction={sortDirection}
                    align="left"
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Client"
                    sortKey="client"
                    activeKey={sortKey}
                    direction={sortDirection}
                    align="left"
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Accounts"
                    sortKey="accountCount"
                    activeKey={sortKey}
                    direction={sortDirection}
                    className="border-l border-line"
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Available / day"
                    sortKey="messagePerDay"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Sent"
                    sortKey="sent"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Bounced"
                    sortKey="bounced"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Bounce rate"
                    sortKey="bounceRate"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Replied"
                    sortKey="replied"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Reply rate"
                    sortKey="replyRate"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Avg warmup"
                    sortKey="avgWarmupReputation"
                    activeKey={sortKey}
                    direction={sortDirection}
                    className="border-l border-line"
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="DNS status"
                    sortKey="dnsStatus"
                    activeKey={sortKey}
                    direction={sortDirection}
                    align="left"
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Inbox risk"
                    sortKey="inboxRisk"
                    activeKey={sortKey}
                    direction={sortDirection}
                    align="left"
                    onSort={sortBy}
                  />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isSelected = selected.has(row.domain)
                  return (
                    <tr
                      key={row.domain}
                      className={`border-b border-line-soft transition last:border-0 hover:bg-white/[0.03] ${
                        isSelected ? 'bg-lime/[0.055]' : ''
                      }`}
                    >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          selectDomain(
                            row.domain,
                            event.target.checked,
                            (event.nativeEvent as MouseEvent).shiftKey,
                          )
                        }
                        aria-label={`Select ${row.domain}`}
                        title="Shift-click to select or deselect a range"
                        className="h-3.5 w-3.5 accent-lime"
                      />
                    </td>
                    <td className={`${TD} font-medium text-ink`}>
                      <span className="inline-flex items-center gap-2">
                        <EmailProviderIcons providers={row.providerTypes} />
                        <span>{row.domain}</span>
                        <button
                          type="button"
                          onClick={() => void copyDomains([row.domain])}
                          aria-label={`Copy ${row.domain}`}
                          title={`Copy ${row.domain}`}
                          className="rounded border border-line px-1.5 py-0.5 text-[9px] font-medium text-faint transition hover:border-lime/30 hover:text-lime focus:outline-none focus-visible:ring-2 focus-visible:ring-lime/50"
                        >
                          Copy
                        </button>
                      </span>
                    </td>
                    <td
                      className={`${TD} max-w-[190px] truncate text-left text-muted`}
                      title={
                        row.tagNames.length > 0
                          ? row.tagNames.join(', ')
                          : 'No client tag'
                      }
                    >
                      {row.tagNames.length > 0
                        ? row.tagNames.join(', ')
                        : '—'}
                    </td>
                    <td
                      className={`${TD} border-l border-line text-right text-muted`}
                    >
                      {fmt(row.accountCount)}
                    </td>
                    <td className={`${TD} text-right text-muted`}>
                      {fmt(row.messagePerDay)}
                    </td>
                    <td className={`${TD} text-right font-medium text-ink`}>
                      {fmt(row.sent)}
                    </td>
                    <td
                      className={`${TD} text-right ${
                        row.bounced > 0 ? 'text-critical' : 'text-faint'
                      }`}
                    >
                      {fmt(row.bounced)}
                    </td>
                    <td
                      className={`${TD} text-right font-medium ${
                        row.bounceRate > 3
                          ? 'text-critical'
                          : row.bounceRate > 1
                            ? 'text-warn'
                            : 'text-positive'
                      }`}
                    >
                      {pct(row.bounceRate)}
                    </td>
                    <td className={`${TD} text-right text-ink`}>
                      {fmt(row.replied)}
                    </td>
                    <td
                      className={`${TD} text-right font-medium ${
                        row.replyRate > 0 ? 'text-positive' : 'text-faint'
                      }`}
                    >
                      {pct(row.replyRate)}
                    </td>
                    <td
                      className={`${TD} border-l border-line text-right font-medium ${
                        row.avgWarmupReputation === null
                          ? 'text-faint'
                          : row.avgWarmupReputation >= 90
                            ? 'text-positive'
                            : row.avgWarmupReputation >= 75
                              ? 'text-warn'
                              : 'text-critical'
                      }`}
                    >
                      {row.avgWarmupReputation ?? '—'}
                    </td>
                    <td className={`${TD} text-left`}>
                      {row.dnsValidated ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-positive/10 px-2.5 py-1 text-[10px] font-medium text-positive ring-1 ring-inset ring-positive/25">
                          <span>✓</span> DNS validated
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-critical/10 px-2.5 py-1 text-[10px] font-medium text-critical ring-1 ring-inset ring-critical/25"
                          title={`Missing ${row.missingDns.join(', ')}`}
                        >
                          Missing {row.missingDns.join(', ')}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-left`}>
                      {row.inboxRisk ? (
                        <InboxRiskBadge
                          domain={row.domain}
                          risk={row.inboxRisk}
                          open={openRiskDomain === row.domain}
                          onOpenChange={(open) =>
                            setOpenRiskDomain(open ? row.domain : null)
                          }
                        />
                      ) : (
                        <span
                          className="text-faint"
                          title={inboxRiskTitle(row)}
                        >
                          —
                        </span>
                      )}
                    </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pasteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="health-paste-select-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPasteOpen(false)
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
            <div className="flex items-start gap-4 border-b border-line px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-critical/15 bg-critical/10 text-lg text-critical">
                ▣
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="health-paste-select-title"
                  className="text-[16px] font-semibold text-ink"
                >
                  Paste to Select
                </h3>
                <p className="mt-0.5 text-[12px] text-muted">
                  Paste domains to add or remove them from this health-table selection
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                aria-label="Close paste to select"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xl text-muted transition hover:bg-white/[0.05] hover:text-ink"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 p-5">
              <textarea
                autoFocus
                value={pastedDomains}
                onChange={(event) => setPastedDomains(event.target.value)}
                placeholder={'acme.com\nexample.org\nhello@company.co'}
                className="min-h-44 max-h-64 w-full resize-y overflow-y-auto rounded-xl border border-line bg-panel-2 p-3 font-mono text-[12px] leading-6 text-ink outline-none placeholder:text-faint focus:border-lime/50"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1">
                  {(['add', 'remove'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPasteMode(mode)}
                      className={`rounded-md px-3 py-1.5 text-[10px] font-medium capitalize transition ${
                        pasteMode === mode
                          ? 'bg-lime/[0.12] text-lime'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {mode} selection
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-positive">
                    {pastedDomainResult.matched.length} matched
                  </span>
                  {pastedDomainResult.unmatched.length > 0 && (
                    <span className="text-warn">
                      {pastedDomainResult.unmatched.length} not found
                    </span>
                  )}
                  {pastedDomainResult.invalid.length > 0 && (
                    <span className="text-critical">
                      {pastedDomainResult.invalid.length} invalid
                    </span>
                  )}
                </div>
              </div>

              {pastedDomainResult.invalid.length > 0 && (
                <div className="max-h-20 overflow-y-auto rounded-lg border border-critical/20 bg-critical/10 px-3 py-2 text-[10px] text-critical">
                  Invalid domain format: {pastedDomainResult.invalid.join(', ')}
                </div>
              )}
              {pastedDomainResult.unmatched.length > 0 && (
                <div className="max-h-20 overflow-y-auto rounded-lg border border-warn/20 bg-warn/[0.08] px-3 py-2 text-[10px] text-warn">
                  Not found in loaded domains: {pastedDomainResult.unmatched.join(', ')}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  className="h-10 rounded-lg border border-line px-4 text-[11px] font-medium text-muted transition hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyPastedSelection}
                  disabled={pastedDomainResult.matched.length === 0}
                  className="h-10 rounded-lg bg-lime-fill px-5 text-[11px] font-semibold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pasteMode === 'remove' ? 'Remove' : 'Add'}{' '}
                  {fmt(pastedDomainResult.matched.length)} domain
                  {pastedDomainResult.matched.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
