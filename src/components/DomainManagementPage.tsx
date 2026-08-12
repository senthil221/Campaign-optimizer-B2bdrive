import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import type {
  DomainBlacklistStatus,
  DomainBulkUpdateRequest,
  DomainHealthRow,
  DomainOutboundSettings,
  DomainSettingsAction,
  DomainWarmupSettings,
  EmailAccount,
  SmartleadTag,
} from '../types'
import {
  createSmartleadTag,
  fetchSmartleadTags,
} from '../services/smartlead'
import {
  buildDomainManagementRows,
  domainFromEmail,
  isValidDomain,
} from '../utils/domainManagement'
import { EmailProviderIcons } from './EmailProviderIcon'

interface Props {
  accounts: EmailAccount[]
  healthRows: DomainHealthRow[]
  blacklist: Map<string, DomainBlacklistStatus>
  blacklistLoading: boolean
  blacklistError: string | null
  loading: boolean
  error: string | null
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onApply: () => void
  onPreset: (days: 1 | 3 | 7) => void
  onUpdate: (request: DomainBulkUpdateRequest) => Promise<string>
  onValidateDns: () => Promise<string>
  onBulkReconnect: () => Promise<string>
}

const IST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-panel-2 px-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/60 disabled:cursor-not-allowed disabled:opacity-50'
const LABEL =
  'mb-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-muted'

type SortKey =
  | 'domain'
  | 'senderName'
  | 'tags'
  | 'ageDays'
  | 'dailyLimit'
  | 'sent'
  | 'replyRate'
  | 'bounceRate'
  | 'avgWarmupReputation'
  | 'dnsStatus'
  | 'connected'
  | 'blacklist'
type SortDirection = 'asc' | 'desc'
type OpenFilter = 'tags' | 'warmup' | 'sender' | 'blacklist' | null

interface FilterOption {
  value: string
  label: string
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`
}

function formatDomainAge(days: number | null): string {
  if (days === null) return '—'
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} month${months === 1 ? '' : 's'}`
  }
  const years = days / 365
  return `${years >= 10 ? Math.floor(years) : years.toFixed(1)} years`
}

function formatCreatedDate(value: string | null): string {
  if (!value) return 'Account creation date unavailable'
  return `First account added ${new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))}`
}

function normalizePastedDomain(value: string): string {
  let domain = value.trim().toLowerCase()
  if (domain.includes('@')) domain = domain.slice(domain.lastIndexOf('@') + 1)
  domain = domain.replace(/^https?:\/\//, '').split('/')[0]
  return domain.replace(/^@/, '').replace(/[.,]+$/, '')
}

function toggledFilterValues(
  current: Set<string>,
  value: string,
): Set<string> {
  if (value === 'all') return new Set()
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function FilterMenu({
  label,
  values,
  options,
  open,
  onToggle,
  onClose,
  onToggleValue,
}: {
  label: string
  values: Set<string>
  options: FilterOption[]
  open: boolean
  onToggle: () => void
  onClose: () => void
  onToggleValue: (value: string) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const active = values.size > 0
  const selectedLabel =
    values.size === 0
      ? options.find((option) => option.value === 'all')?.label ?? 'All'
      : values.size === 1
        ? options.find((option) => values.has(option.value))?.label ??
          '1 selected'
        : `${values.size} selected`

  useEffect(() => {
    if (!open) return
    const closeIfOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
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
  }, [onClose, open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex h-8 min-w-[132px] items-center justify-between gap-3 rounded-lg border px-3 text-[10px] font-medium transition ${
          active
            ? 'border-lime/30 bg-lime/[0.08] text-lime'
            : 'border-line bg-panel-2 text-muted hover:text-ink'
        }`}
      >
        <span className="truncate">{label}: {selectedLabel}</span>
        <span className={`text-[9px] transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-lg border border-line bg-panel shadow-2xl">
          <div className="max-h-48 overflow-y-auto overscroll-contain p-1.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggleValue(option.value)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[10px] transition hover:bg-white/[0.05] ${
                  (option.value === 'all'
                    ? values.size === 0
                    : values.has(option.value))
                    ? 'bg-lime/[0.08] text-lime'
                    : 'text-muted'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {(option.value === 'all'
                  ? values.size === 0
                  : values.has(option.value)) && <span>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === activeKey
  return (
    <th className={`whitespace-nowrap px-2.5 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.1em] transition hover:text-ink ${
          active ? 'text-lime' : 'text-muted/80'
        }`}
      >
        {label}
        <span className="w-2.5 text-center text-[9px]">
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function WarmupBadge({
  state,
  enabled,
  total,
}: {
  state: 'enabled' | 'disabled' | 'mixed'
  enabled: number
  total: number
}) {
  const styles = {
    enabled: 'border-positive/25 bg-positive/10 text-positive',
    disabled: 'border-critical/25 bg-critical/10 text-critical',
    mixed: 'border-warn/25 bg-warn/10 text-warn',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${styles[state]}`}
      title={`${enabled}/${total} accounts have warmup enabled`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {state}
    </span>
  )
}

function blacklistTotal(status: DomainBlacklistStatus): number {
  return status.domainBlacklistCount + status.ipBlacklistCount
}

function BlacklistBadge({
  status,
  loading,
}: {
  status: DomainBlacklistStatus | undefined
  loading: boolean
}) {
  if (!status) {
    return (
      <span className="text-[10px] text-faint" title={
        loading
          ? 'Checking blacklists…'
          : 'No blacklist data — domain is not connected to a scanned campaign'
      }>
        {loading ? 'Checking…' : '—'}
      </span>
    )
  }

  const total = blacklistTotal(status)
  if (total === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-1 text-[10px] font-medium text-positive ring-1 ring-inset ring-positive/25"
        title={`Clean — ${status.totalTests} RBL${
          status.totalTests === 1 ? '' : 's'
        } checked${status.ip ? ` · IP ${status.ip}` : ''}`}
      >
        ✓ Clean
      </span>
    )
  }

  const parts: string[] = []
  if (status.domainBlacklistCount > 0) {
    parts.push(
      `Domain listed on ${status.domainBlacklistCount} RBL${
        status.domainBlacklistCount === 1 ? '' : 's'
      }`,
    )
  }
  if (status.ipBlacklistCount > 0) {
    parts.push(
      `IP${status.ip ? ` ${status.ip}` : ''} listed on ${
        status.ipBlacklistCount
      } RBL${status.ipBlacklistCount === 1 ? '' : 's'}`,
    )
  }
  const rblNames = Array.from(
    new Set(status.listings.map((listing) => listing.rblName).filter(Boolean)),
  )
  const title = `${parts.join(' · ')}${
    rblNames.length > 0 ? `\n${rblNames.join(', ')}` : ''
  }`

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-critical/25 bg-critical/10 px-2 py-0.5 text-[10px] font-semibold text-critical"
      title={title}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Blacklisted
      <span className="tnum">({total})</span>
    </span>
  )
}

function SettingsCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-line bg-panel shadow-panel">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-[15px] w-[3px] rounded-full bg-lime" />
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-4 p-5">{children}</div>
    </section>
  )
}

function ApplyButton({
  action,
  busy,
  disabled,
  onClick,
}: {
  action: DomainSettingsAction
  busy: DomainSettingsAction | null
  disabled: boolean
  onClick: () => void
}) {
  const labels: Record<DomainSettingsAction, string> = {
    tags: 'Update tags',
    outbound_limit: 'Update max emails',
    outbound_wait: 'Update min wait',
    warmup: 'Update warmup settings',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy !== null}
      className="mt-auto h-10 w-full rounded-lg bg-lime-fill px-3 text-[12px] font-semibold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy === action ? 'Updating…' : labels[action]}
    </button>
  )
}

export default function DomainManagementPage({
  accounts,
  healthRows,
  blacklist,
  blacklistLoading,
  blacklistError,
  loading,
  error,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onPreset,
  onUpdate,
  onValidateDns,
  onBulkReconnect,
}: Props) {
  const rows = useMemo(() => buildDomainManagementRows(accounts), [accounts])
  const [tagFilters, setTagFilters] = useState<Set<string>>(() => new Set())
  const [warmupFilters, setWarmupFilters] = useState<Set<string>>(
    () => new Set(),
  )
  const [senderFilters, setSenderFilters] = useState<Set<string>>(
    () => new Set(),
  )
  const [blacklistFilters, setBlacklistFilters] = useState<Set<string>>(
    () => new Set(),
  )
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null)
  const [sortKey, setSortKey] = useState<SortKey>('domain')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pastedDomains, setPastedDomains] = useState('')
  const [pasteMode, setPasteMode] = useState<'add' | 'remove'>('add')
  const [busy, setBusy] = useState<DomainSettingsAction | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)
  const [tags, setTags] = useState('')
  const [messagePerDay, setMessagePerDay] = useState(9)
  const [minTimeToWaitInMins, setMinTimeToWaitInMins] = useState(60)
  const [warmupMax, setWarmupMax] = useState(5)
  const [warmupRamp, setWarmupRamp] = useState(1)
  const [warmupReplyRate, setWarmupReplyRate] = useState(60)
  const [warmupTag, setWarmupTag] = useState('hey-there')
  const [rampupEnabled, setRampupEnabled] = useState(true)
  const [serverKnownTags, setServerKnownTags] = useState<string[]>([])
  const [tagManagerTags, setTagManagerTags] = useState<SmartleadTag[]>([])
  const [tagManagerLoading, setTagManagerLoading] = useState(false)
  const [tagManagerError, setTagManagerError] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [dnsValidating, setDnsValidating] = useState(false)
  const [bulkReconnecting, setBulkReconnecting] = useState(false)
  const tagFetchStartedRef = useRef(false)
  const selectionAnchorRef = useRef<string | null>(null)

  useEffect(() => {
    const domains = new Set(rows.map((row) => row.domain))
    setSelected(
      (current) => new Set(Array.from(current).filter((domain) => domains.has(domain))),
    )
  }, [rows])

  const loadTagManagerTags = useCallback(async () => {
    setTagManagerLoading(true)
    setTagManagerError(null)
    try {
      setTagManagerTags(await fetchSmartleadTags(''))
    } catch (loadError) {
      setTagManagerError(
        loadError instanceof Error ? loadError.message : String(loadError),
      )
    } finally {
      setTagManagerLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tagFetchStartedRef.current) return
    tagFetchStartedRef.current = true
    void loadTagManagerTags()
  }, [loadTagManagerTags])

  useEffect(() => {
    if (!notice) return
    // Errors linger longer so they're readable before auto-dismissing.
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.type === 'error' ? 5000 : 2500,
    )
    return () => window.clearTimeout(timeout)
  }, [notice])

  const knownTags = useMemo(
    () =>
      Array.from(new Set(accounts.flatMap((account) => account.tagNames))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [accounts],
  )
  const selectableTags = useMemo(
    () =>
      Array.from(
        new Set([
          ...knownTags,
          ...serverKnownTags,
          ...tagManagerTags.map((tag) => tag.name),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [knownTags, serverKnownTags, tagManagerTags],
  )
  const tagColorByName = useMemo(
    () =>
      new Map(
        tagManagerTags.map((tag) => [tag.name.toLowerCase(), tag.color]),
      ),
    [tagManagerTags],
  )
  const tagFilterOptions = useMemo<FilterOption[]>(
    () => [
      { value: 'all', label: 'All tags' },
      { value: 'untagged', label: 'Untagged' },
      ...knownTags.map((tag) => ({ value: tag, label: tag })),
    ],
    [knownTags],
  )
  const senderFilterOptions = useMemo<FilterOption[]>(() => {
    const names = new Map<string, string>()
    for (const row of rows) {
      for (const sender of row.senderNames) {
        const key = sender.name.toLowerCase()
        if (!names.has(key)) names.set(key, sender.name)
      }
    }
    return [
      { value: 'all', label: 'All senders' },
      ...Array.from(names, ([value, label]) => ({ value, label })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    ]
  }, [rows])
  const warmupFilterOptions: FilterOption[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Disabled' },
    { value: 'mixed', label: 'Mixed' },
  ]
  const blacklistFilterOptions: FilterOption[] = [
    { value: 'all', label: 'All' },
    { value: 'blacklisted', label: 'Blacklisted' },
    { value: 'clean', label: 'Clean' },
    { value: 'unknown', label: 'Not checked' },
  ]
  const invalidDomainAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => !isValidDomain(domainFromEmail(account.fromEmail)),
      ),
    [accounts],
  )
  const healthByDomain = useMemo(
    () => new Map(healthRows.map((row) => [row.domain, row])),
    [healthRows],
  )

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (tagFilters.size > 0) {
        const matchesTag =
          (tagFilters.has('untagged') && row.tagNames.length === 0) ||
          row.tagNames.some((tagName) => tagFilters.has(tagName))
        if (!matchesTag) return false
      }
      if (
        warmupFilters.size > 0 &&
        !warmupFilters.has(row.warmupState)
      )
        return false
      if (
        senderFilters.size > 0 &&
        !row.senderNames.some(
          (sender) => senderFilters.has(sender.name.toLowerCase()),
        )
      )
        return false
      if (blacklistFilters.size > 0) {
        const status = blacklist.get(row.domain)
        const category = !status
          ? 'unknown'
          : blacklistTotal(status) > 0
            ? 'blacklisted'
            : 'clean'
        if (!blacklistFilters.has(category)) return false
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortKey === 'domain') comparison = a.domain.localeCompare(b.domain)
      if (sortKey === 'senderName') {
        comparison = a.senderNames
          .map((sender) => sender.name)
          .join(', ')
          .localeCompare(b.senderNames.map((sender) => sender.name).join(', '))
      }
      if (sortKey === 'tags') {
        // Untagged domains sort last ascending, first descending.
        const aTags = a.tagNames.join(', ')
        const bTags = b.tagNames.join(', ')
        if (!aTags && !bTags) comparison = 0
        else if (!aTags) comparison = 1
        else if (!bTags) comparison = -1
        else comparison = aTags.localeCompare(bTags)
      }
      if (sortKey === 'ageDays') {
        if (a.ageDays === null && b.ageDays === null) comparison = 0
        else if (a.ageDays === null) comparison = 1
        else if (b.ageDays === null) comparison = -1
        else comparison = a.ageDays - b.ageDays
      }
      if (sortKey === 'dailyLimit') {
        comparison = (a.dailyLimit ?? a.dailyLimitMin) - (b.dailyLimit ?? b.dailyLimitMin)
      }
      if (sortKey === 'sent') {
        comparison =
          (healthByDomain.get(a.domain)?.sent ?? -1) -
          (healthByDomain.get(b.domain)?.sent ?? -1)
      }
      if (sortKey === 'replyRate') {
        comparison =
          (healthByDomain.get(a.domain)?.replyRate ?? -1) -
          (healthByDomain.get(b.domain)?.replyRate ?? -1)
      }
      if (sortKey === 'bounceRate') {
        comparison =
          (healthByDomain.get(a.domain)?.bounceRate ?? -1) -
          (healthByDomain.get(b.domain)?.bounceRate ?? -1)
      }
      if (sortKey === 'avgWarmupReputation') {
        comparison =
          (healthByDomain.get(a.domain)?.avgWarmupReputation ?? -1) -
          (healthByDomain.get(b.domain)?.avgWarmupReputation ?? -1)
      }
      if (sortKey === 'dnsStatus') {
        comparison =
          (healthByDomain.get(a.domain)?.missingDns.length ?? 4) -
          (healthByDomain.get(b.domain)?.missingDns.length ?? 4)
      }
      if (sortKey === 'connected') {
        comparison = a.connectedCount / a.accountCount - b.connectedCount / b.accountCount
      }
      if (sortKey === 'blacklist') {
        const aStatus = blacklist.get(a.domain)
        const bStatus = blacklist.get(b.domain)
        comparison =
          (aStatus ? blacklistTotal(aStatus) : -1) -
          (bStatus ? blacklistTotal(bStatus) : -1)
      }
      if (comparison === 0) comparison = a.domain.localeCompare(b.domain)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [
    blacklist,
    blacklistFilters,
    healthByDomain,
    rows,
    senderFilters,
    sortDirection,
    sortKey,
    tagFilters,
    warmupFilters,
  ])

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.domain)),
    [rows, selected],
  )
  const selectedAccounts = useMemo(
    () => selectedRows.flatMap((row) => row.accounts),
    [selectedRows],
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
    const invalid = parsed.filter((domain) => !isValidDomain(domain))
    const matched = parsed.filter(
      (domain) => isValidDomain(domain) && loadedDomains.has(domain),
    )
    const unmatched = parsed.filter(
      (domain) => isValidDomain(domain) && !loadedDomains.has(domain),
    )
    return { invalid, matched, unmatched }
  }, [pastedDomains, rows])
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.domain))

  const knownDomainAges = rows.flatMap((row) =>
    row.ageDays === null ? [] : [row.ageDays],
  )
  const averageDomainAge =
    knownDomainAges.length > 0
      ? Math.round(
          knownDomainAges.reduce((sum, age) => sum + age, 0) /
            knownDomainAges.length,
        )
      : null
  const filtersActive =
    tagFilters.size > 0 ||
    warmupFilters.size > 0 ||
    senderFilters.size > 0 ||
    blacklistFilters.size > 0

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
  const rangeLabel = startDate === endDate ? startDate : `${startDate} → ${endDate}`

  const submitRange = (event: FormEvent) => {
    event.preventDefault()
    if (validRange && !loading) onApply()
  }

  const clearFilters = () => {
    setTagFilters(new Set())
    setWarmupFilters(new Set())
    setSenderFilters(new Set())
    setBlacklistFilters(new Set())
    setOpenFilter(null)
  }

  const sortBy = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'domain' ? 'asc' : 'desc')
  }

  const applyPastedSelection = () => {
    if (pastedDomainResult.matched.length === 0) return
    selectionAnchorRef.current = null
    setSelected((current) => {
      const next = new Set(current)
      pastedDomainResult.matched.forEach((domain) => {
        if (pasteMode === 'remove') next.delete(domain)
        else next.add(domain)
      })
      return next
    })
    setPasteOpen(false)
    setPastedDomains('')
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

  const runUpdate = async (
    action: DomainSettingsAction,
    extra: Pick<DomainBulkUpdateRequest, 'tags' | 'settings'>,
  ) => {
    if (selectedRows.length === 0 || busy) return
    setBusy(action)
    setOperationError(null)
    setNotice(null)
    try {
      const message = await onUpdate({
        action,
        domains: selectedRows.map((row) => row.domain),
        accounts: selectedAccounts,
        ...extra,
      })
      setNotice({ message, type: 'success' })
      // Selection and filters are intentionally left intact so several changes
      // can be applied to the same domains without re-selecting them. Use
      // "Clear selection" when done.
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : String(updateError)
      let displayMessage = message
      if (action === 'tags') {
        const available = message.match(/Available tags:\s*([\s\S]*)$/i)?.[1]
        if (available) {
          setServerKnownTags((current) =>
            Array.from(
              new Set([
                ...current,
                ...available
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ]),
            ),
          )
          displayMessage = message
            .replace(/\s*Available tags:\s*[\s\S]*$/i, '')
            .trim()
        }
      }
      setOperationError(displayMessage)
      setNotice({ message: displayMessage, type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const runDnsValidation = async () => {
    if (dnsValidating) return
    setDnsValidating(true)
    setOperationError(null)
    setNotice(null)
    try {
      setNotice({ message: await onValidateDns(), type: 'success' })
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : String(validationError)
      setOperationError(message)
      setNotice({ message, type: 'error' })
    } finally {
      setDnsValidating(false)
    }
  }

  const runBulkReconnect = async () => {
    if (bulkReconnecting) return
    setBulkReconnecting(true)
    setOperationError(null)
    setNotice(null)
    try {
      setNotice({ message: await onBulkReconnect(), type: 'success' })
    } catch (reconnectError) {
      const message =
        reconnectError instanceof Error
          ? reconnectError.message
          : String(reconnectError)
      setOperationError(message)
      setNotice({ message, type: 'error' })
    } finally {
      setBulkReconnecting(false)
    }
  }

  const parsedTags = Array.from(
    new Set(
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )
  const toggleConfiguredTag = (tagName: string) => {
    setTags((current) => {
      const currentTags = Array.from(
        new Set(
          current
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      )
      const next = currentTags.includes(tagName)
        ? currentTags.filter((tag) => tag !== tagName)
        : [...currentTags, tagName]
      return next.join(', ')
    })
  }

  const addConfiguredTag = (tagName: string) => {
    setTags((current) =>
      Array.from(
        new Set([
          ...current
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          tagName,
        ]),
      ).join(', '),
    )
  }

  const createTag = async () => {
    const name = newTagName.trim()
    if (!name || creatingTag) return
    const existing = selectableTags.find(
      (tag) => tag.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      addConfiguredTag(existing)
      setNewTagName('')
      setTagManagerError(null)
      return
    }

    setCreatingTag(true)
    setTagManagerError(null)
    try {
      const created = await createSmartleadTag('', name)
      setTagManagerTags((current) => [
        created,
        ...current.filter((tag) => tag.id !== created.id),
      ])
      addConfiguredTag(created.name)
      setNewTagName('')
    } catch (createError) {
      setTagManagerError(
        createError instanceof Error ? createError.message : String(createError),
      )
    } finally {
      setCreatingTag(false)
    }
  }
  const knownTagSet = new Set(selectableTags)
  const invalidTags = parsedTags.filter((tag) => !knownTagSet.has(tag))
  const tagInputError =
    tags.trim() && invalidTags.length > 0
      ? `Unknown Smartlead tag${invalidTags.length === 1 ? '' : 's'}: ${invalidTags.join(', ')}`
      : null
  const noSelection = selectedRows.length === 0

  const outboundLimitSettings: DomainOutboundSettings = {
    messagePerDay,
    status: 'ACTIVE',
  }
  const outboundWaitSettings: DomainOutboundSettings = {
    minTimeToWaitInMins,
    status: 'ACTIVE',
  }
  const warmupSettings: DomainWarmupSettings = {
    isRampupEnabled: rampupEnabled,
    maxEmailPerDay: warmupMax,
    rampupValue: warmupRamp,
    replyRate: warmupReplyRate,
    status: 'ACTIVE',
    warmupTagIdentifier: warmupTag.trim(),
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-[110] flex max-w-[min(420px,calc(100vw-40px))] items-start gap-2 rounded-xl border bg-panel px-4 py-3 text-[11px] font-medium shadow-2xl shadow-black/40 ${
            notice.type === 'error'
              ? 'border-critical/30 text-critical'
              : 'border-positive/25 text-positive'
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
              notice.type === 'error' ? 'bg-critical/15' : 'bg-positive/15'
            }`}
          >
            {notice.type === 'error' ? '!' : '✓'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold">
              {notice.type === 'error' ? 'Update failed' : 'Successfully updated'}
            </div>
            {notice.message && (
              <div className="mt-0.5 text-[10px] font-normal text-muted">
                {notice.message}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
            className="ml-1 shrink-0 text-[13px] leading-none text-muted transition hover:text-ink"
          >
            ×
          </button>
        </div>
      )}
      <section className="animate-rise overflow-hidden rounded-xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="mr-auto flex items-center gap-3">
            <span className="h-[18px] w-[3px] rounded-full bg-lime" />
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Domain Management
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void runDnsValidation()}
            disabled={dnsValidating || bulkReconnecting || loading}
            className="h-8 rounded-lg border border-lime/30 bg-lime/[0.08] px-3 text-[10px] font-semibold text-lime transition hover:bg-lime/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dnsValidating ? 'Validating DNS…' : 'Validate DNS'}
          </button>
          <button
            type="button"
            onClick={() => void runBulkReconnect()}
            disabled={bulkReconnecting || dnsValidating || loading}
            className="h-8 rounded-lg border border-line bg-panel-2 px-3 text-[10px] font-semibold text-muted transition hover:border-lime/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkReconnecting ? 'Reconnecting…' : 'Bulk Reconnect'}
          </button>
          {[
            ['Domains', rows.length.toLocaleString()],
            ['Avg age', formatDomainAge(averageDomainAge)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-line bg-panel-2 px-3 py-1.5"
            >
              <span className="mr-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-faint">
                {label}
              </span>
              <span className="tnum text-[11px] font-semibold text-ink">{value}</span>
            </div>
          ))}
          <div className="rounded-lg border border-lime/20 bg-lime/[0.07] px-3 py-1.5">
            <span className="mr-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-muted">
              Selected
            </span>
            <span className="tnum text-[11px] font-semibold text-lime">
              {plural(selectedRows.length, 'domain')} · {selectedAccounts.length} accounts
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[11px] text-muted">
            Sent, reply rate, and bounce rate for{' '}
            <span className="font-medium text-ink">{rangeLabel}</span>
          </p>
          <form onSubmit={submitRange} className="flex flex-wrap items-end gap-2">
            <div>
              <span className={LABEL}>Quick range</span>
              <div className="flex h-9 overflow-hidden rounded-lg border border-line bg-panel-2 p-0.5">
                {([
                  ['Today', 1, 'today'],
                  ['3D', 3, '3d'],
                  ['7D', 7, '7d'],
                ] as const).map(([label, days, key]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={loading}
                    onClick={() => onPreset(days)}
                    className={`rounded-md px-3 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      activePreset === key
                        ? 'bg-lime-fill text-[#18200c] shadow-sm'
                        : 'text-muted hover:bg-panel hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className={LABEL}>Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="h-9 rounded-lg border border-line bg-panel-2 px-3 text-[12px] font-medium text-ink outline-none transition focus:border-lime/60"
              />
            </label>
            <label className="block">
              <span className={LABEL}>End date</span>
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
          <div className="border-t border-critical/20 bg-critical/10 px-4 py-2 text-[11px] text-critical">
            End date must be on or after the start date.
          </div>
        )}
        {(error || operationError) && (
          <div className="border-t border-critical/20 bg-critical/10 px-4 py-2 text-[11px] text-critical">
            <span className="font-semibold">Could not complete the request.</span>{' '}
            {operationError || error}
          </div>
        )}
        {invalidDomainAccounts.length > 0 && (
          <div className="border-t border-warn/20 bg-warn/[0.08] px-4 py-2 text-[11px] text-warn">
            <span className="font-semibold">Invalid domain format:</span>{' '}
            {invalidDomainAccounts
              .slice(0, 3)
              .map((account) => account.fromEmail || `Account ${account.id}`)
              .join(', ')}
            {invalidDomainAccounts.length > 3
              ? ` and ${invalidDomainAccounts.length - 3} more`
              : ''}
            . These accounts were excluded.
          </div>
        )}
        {blacklistError && (
          <div className="border-t border-warn/20 bg-warn/[0.08] px-4 py-2 text-[11px] text-warn">
            <span className="font-semibold">Blacklist status unavailable:</span>{' '}
            {blacklistError}
          </div>
        )}
      </section>

      <section className="animate-rise overflow-hidden rounded-xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="h-[15px] w-[3px] rounded-full bg-lime" />
            <h3 className="text-[13px] font-semibold text-ink">Domains</h3>
            <span className="tnum rounded-md bg-panel-2 px-2 py-0.5 text-[10px] text-muted">
              {visibleRows.length}/{rows.length}
            </span>
            <span
              className="rounded-md border border-lime/20 bg-lime/[0.07] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-lime"
              title={`Sent, reply rate, and bounce rate for ${rangeLabel}`}
            >
              Health: {activePreset ? activePreset.toUpperCase() : rangeLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="hidden text-[10px] text-faint 2xl:inline">
              Shift-click checkboxes to select a range
            </span>
            <FilterMenu
              label="Sender"
              values={senderFilters}
              options={senderFilterOptions}
              open={openFilter === 'sender'}
              onToggle={() =>
                setOpenFilter((current) =>
                  current === 'sender' ? null : 'sender',
                )
              }
              onClose={() => setOpenFilter(null)}
              onToggleValue={(value) =>
                setSenderFilters((current) =>
                  toggledFilterValues(current, value),
                )
              }
            />
            <FilterMenu
              label="Tags"
              values={tagFilters}
              options={tagFilterOptions}
              open={openFilter === 'tags'}
              onToggle={() => setOpenFilter((current) => current === 'tags' ? null : 'tags')}
              onClose={() => setOpenFilter(null)}
              onToggleValue={(value) =>
                setTagFilters((current) => toggledFilterValues(current, value))
              }
            />
            <FilterMenu
              label="Warmup"
              values={warmupFilters}
              options={warmupFilterOptions}
              open={openFilter === 'warmup'}
              onToggle={() => setOpenFilter((current) => current === 'warmup' ? null : 'warmup')}
              onClose={() => setOpenFilter(null)}
              onToggleValue={(value) =>
                setWarmupFilters((current) =>
                  toggledFilterValues(current, value),
                )
              }
            />
            <FilterMenu
              label="Blacklist"
              values={blacklistFilters}
              options={blacklistFilterOptions}
              open={openFilter === 'blacklist'}
              onToggle={() =>
                setOpenFilter((current) =>
                  current === 'blacklist' ? null : 'blacklist',
                )
              }
              onClose={() => setOpenFilter(null)}
              onToggleValue={(value) =>
                setBlacklistFilters((current) =>
                  toggledFilterValues(current, value),
                )
              }
            />
            <button
              type="button"
              onClick={() => {
                setPasteOpen(true)
                setOpenFilter(null)
              }}
              className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[10px] font-medium text-muted transition hover:border-lime/30 hover:text-ink"
            >
              <span className="text-critical">▣</span>
              Paste to select
            </button>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-7 rounded-md border border-line px-2.5 text-[10px] font-medium text-muted transition hover:text-ink"
              >
                Clear filters
              </button>
            )}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  selectionAnchorRef.current = null
                  setSelected(new Set())
                }}
                className="h-7 rounded-md border border-line px-2.5 text-[10px] font-medium text-muted transition hover:text-ink"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-lg bg-white/[0.04]"
              />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="px-5 py-14 text-center text-[12px] text-muted">
            {filtersActive ? 'No domains match the active filters.' : 'No domains found.'}
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto overscroll-contain">
            <table className="w-full min-w-[1580px] border-collapse">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-left">
                  <th className="w-11 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisible}
                      aria-label="Select all visible domains"
                      className="h-3.5 w-3.5 accent-lime"
                    />
                  </th>
                  <SortHeader label="Domain" sortKey="domain" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                  <SortHeader label="Sender names" sortKey="senderName" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                  <SortHeader label="Tags" sortKey="tags" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                  <SortHeader label="Domain age" sortKey="ageDays" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Daily limit" sortKey="dailyLimit" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Sent" sortKey="sent" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Reply rate" sortKey="replyRate" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Bounce rate" sortKey="bounceRate" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Avg warmup" sortKey="avgWarmupReputation" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="DNS validation" sortKey="dnsStatus" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                  <SortHeader label="Connected" sortKey="connected" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                  <th className="whitespace-nowrap px-2.5 py-2.5 text-left text-[9px] font-medium uppercase tracking-[0.1em] text-muted/80">Warmup status</th>
                  <SortHeader label="Blacklisted" sortKey="blacklist" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isSelected = selected.has(row.domain)
                  const health = healthByDomain.get(row.domain)
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
                      <td className="whitespace-nowrap px-2.5 py-2 text-[11px] font-medium text-ink">
                        <span className="inline-flex items-center gap-2">
                          <EmailProviderIcons providers={row.providerTypes} />
                          <span>{row.domain}</span>
                        </span>
                      </td>
                      <td className="max-w-[300px] px-2.5 py-2 text-[10px] text-muted">
                        <div className="flex flex-wrap gap-1">
                          {row.senderNames.map((sender) => (
                            <span
                              key={sender.name.toLowerCase()}
                              className="whitespace-nowrap rounded-md bg-white/[0.045] px-2 py-1"
                              title={`${sender.inboxCount.toLocaleString()} ${
                                sender.inboxCount === 1 ? 'inbox' : 'inboxes'
                              }`}
                            >
                              {sender.name}{' '}
                              <span className="tnum text-faint">
                                ({sender.inboxCount.toLocaleString()})
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td
                        className="max-w-[240px] truncate px-2.5 py-2 text-[11px] text-muted"
                        title={row.tagNames.join(', ')}
                      >
                        {row.tagNames.length > 0 ? row.tagNames.join(', ') : '—'}
                      </td>
                      <td
                        className="tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] text-muted"
                        title={formatCreatedDate(row.createdAt)}
                      >
                        {formatDomainAge(row.ageDays)}
                      </td>
                      <td className="tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] font-semibold text-ink">
                        {row.dailyLimit === null ? (
                          <span
                            className="text-warn"
                            title="Inbox limits differ within this domain"
                          >
                            Mixed {row.dailyLimitMin}–{row.dailyLimitMax}
                          </span>
                        ) : (
                          row.dailyLimit.toLocaleString()
                        )}
                      </td>
                      <td className="tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] font-semibold text-ink">
                        {health ? health.sent.toLocaleString() : '—'}
                      </td>
                      <td
                        className={`tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] font-semibold ${
                          !health
                            ? 'text-faint'
                            : health.replyRate > 0
                              ? 'text-positive'
                              : 'text-faint'
                        }`}
                      >
                        {health ? `${health.replyRate.toFixed(2)}%` : '—'}
                      </td>
                      <td
                        className={`tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] font-semibold ${
                          !health
                            ? 'text-faint'
                            : health.bounceRate > 3
                              ? 'text-critical'
                              : health.bounceRate > 1
                                ? 'text-warn'
                                : 'text-positive'
                        }`}
                      >
                        {health ? `${health.bounceRate.toFixed(2)}%` : '—'}
                      </td>
                      <td
                        className={`tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] font-semibold ${
                          health?.avgWarmupReputation == null
                            ? 'text-faint'
                            : health.avgWarmupReputation >= 90
                              ? 'text-positive'
                              : health.avgWarmupReputation >= 75
                                ? 'text-warn'
                                : 'text-critical'
                        }`}
                      >
                        {health?.avgWarmupReputation ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-[10px]">
                        {!health ? (
                          <span className="text-faint">—</span>
                        ) : health.dnsValidated ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-1 font-medium text-positive ring-1 ring-inset ring-positive/25">
                            ✓ Validated
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full bg-critical/10 px-2 py-1 font-medium text-critical ring-1 ring-inset ring-critical/25"
                            title={`Missing ${health.missingDns.join(', ')}`}
                          >
                            Missing {health.missingDns.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="tnum whitespace-nowrap px-2.5 py-2 text-[11px] text-muted">
                        <span
                          className={
                            row.connectedCount === row.accountCount
                              ? 'text-positive'
                              : 'text-warn'
                          }
                        >
                          {row.connectedCount}/{row.accountCount}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">
                        <WarmupBadge
                          state={row.warmupState}
                          enabled={row.warmupEnabledCount}
                          total={row.accountCount}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">
                        <BlacklistBadge
                          status={blacklist.get(row.domain)}
                          loading={blacklistLoading}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel-2/35 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="h-[18px] w-[3px] rounded-full bg-lime" />
            <h3 className="text-[15px] font-semibold text-ink">Configure settings</h3>
          </div>
          <div className={`rounded-lg border px-3 py-1.5 text-[10px] font-medium ${
            noSelection
              ? 'border-line bg-panel-2 text-muted'
              : 'border-lime/25 bg-lime/[0.08] text-lime'
          }`}>
            {noSelection
              ? 'Select domains to configure'
              : `${plural(selectedRows.length, 'domain')} · ${plural(selectedAccounts.length, 'account')}`}
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-3">
        <SettingsCard title="Tag Management">
          <label>
            <span className={LABEL}>Tags</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="warmup, client-name"
              aria-invalid={tagInputError ? true : undefined}
              className={`${INPUT} ${tagInputError ? 'border-critical/60 focus:border-critical' : ''}`}
            />
          </label>
          {tagInputError && (
            <div className="rounded-md border border-critical/20 bg-critical/10 px-2.5 py-1.5 text-[10px] text-critical">
              {tagInputError}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void createTag()
            }}
          >
            <span className={LABEL}>Create Tag Manager tag</span>
            <div className="flex gap-2">
              <input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="Tag name"
                maxLength={100}
                disabled={creatingTag}
                className={INPUT}
              />
              <button
                type="submit"
                disabled={!newTagName.trim() || creatingTag}
                className="h-10 shrink-0 rounded-lg border border-lime/30 bg-lime/[0.09] px-3 text-[10px] font-semibold text-lime transition hover:bg-lime/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingTag ? 'Creating…' : 'Create'}
              </button>
            </div>
            <p className="mt-1 text-[9px] text-faint">
              A color is assigned automatically.
            </p>
          </form>
          {tagManagerError && (
            <div className="rounded-md border border-critical/20 bg-critical/10 px-2.5 py-2 text-[10px] text-critical">
              <div>{tagManagerError}</div>
              <button
                type="button"
                onClick={() => void loadTagManagerTags()}
                disabled={tagManagerLoading}
                className="mt-1 font-semibold underline underline-offset-2 disabled:opacity-50"
              >
                Retry loading tags
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className={LABEL.replace('mb-1 ', '')}>
              Tag Manager tags
            </span>
            <span className="tnum text-[9px] text-faint">
              {tagManagerLoading ? 'Loading…' : selectableTags.length}
            </span>
          </div>
          <div className="max-h-28 min-h-16 overflow-y-auto overscroll-contain rounded-lg border border-line bg-panel-2 p-2">
            <div className="flex flex-wrap gap-1.5">
              {selectableTags.length > 0 ? (
                selectableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleConfiguredTag(tag)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition ${
                      parsedTags.includes(tag)
                        ? 'border-lime/30 bg-lime/[0.09] text-lime'
                        : 'border-line bg-panel text-muted hover:border-lime/30 hover:text-lime'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full ring-1 ring-black/10"
                      style={{
                        backgroundColor:
                          tagColorByName.get(tag.toLowerCase()) ?? '#9ca3af',
                      }}
                    />
                    {tag}
                    {parsedTags.includes(tag) && <span>✓</span>}
                  </button>
                ))
              ) : tagManagerLoading ? (
                <span className="px-1 text-[9px] text-faint">Loading tags…</span>
              ) : (
                <span className="px-1 text-[9px] text-faint">
                  No Tag Manager tags found
                </span>
              )}
            </div>
          </div>
          <ApplyButton
            action="tags"
            busy={busy}
            disabled={
              noSelection || parsedTags.length === 0 || invalidTags.length > 0
            }
            onClick={() => void runUpdate('tags', { tags: parsedTags })}
          />
        </SettingsCard>

        <SettingsCard title="Outbound Settings">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-3">
              <label>
                <span className={LABEL}>Max emails / day</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={messagePerDay}
                  onChange={(event) =>
                    setMessagePerDay(Number(event.target.value))
                  }
                  className={INPUT}
                />
              </label>
              <ApplyButton
                action="outbound_limit"
                busy={busy}
                disabled={
                  noSelection ||
                  !Number.isInteger(messagePerDay) ||
                  messagePerDay < 0 ||
                  messagePerDay > 1000
                }
                onClick={() =>
                  void runUpdate('outbound_limit', {
                    settings: outboundLimitSettings,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-3">
              <label>
                <span className={LABEL}>Min wait (minutes)</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={minTimeToWaitInMins}
                  onChange={(event) =>
                    setMinTimeToWaitInMins(Number(event.target.value))
                  }
                  className={INPUT}
                />
              </label>
              <ApplyButton
                action="outbound_wait"
                busy={busy}
                disabled={
                  noSelection ||
                  !Number.isInteger(minTimeToWaitInMins) ||
                  minTimeToWaitInMins < 0 ||
                  minTimeToWaitInMins > 1440
                }
                onClick={() =>
                  void runUpdate('outbound_wait', {
                    settings: outboundWaitSettings,
                  })
                }
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title="Warmup Settings">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={LABEL}>Max warmup / day</span>
              <input
                type="number"
                min={0}
                value={warmupMax}
                onChange={(event) => setWarmupMax(Number(event.target.value))}
                className={INPUT}
              />
            </label>
            <label>
              <span className={LABEL}>Ramp up value</span>
              <input
                type="number"
                min={0}
                value={warmupRamp}
                onChange={(event) => setWarmupRamp(Number(event.target.value))}
                className={INPUT}
              />
            </label>
            <label>
              <span className={LABEL}>Reply rate %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={warmupReplyRate}
                onChange={(event) =>
                  setWarmupReplyRate(Number(event.target.value))
                }
                className={INPUT}
              />
            </label>
            <label>
              <span className={LABEL}>Warmup tag identifier</span>
              <input
                value={warmupTag}
                onChange={(event) => setWarmupTag(event.target.value)}
                className={INPUT}
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2.5">
            <span className="text-[12px] font-medium text-muted">Enable ramp up</span>
            <input
              type="checkbox"
              checked={rampupEnabled}
              onChange={(event) => setRampupEnabled(event.target.checked)}
              className="h-3.5 w-3.5 accent-lime"
            />
          </label>
          <ApplyButton
            action="warmup"
            busy={busy}
            disabled={
              noSelection ||
              !Number.isInteger(warmupMax) ||
              warmupMax < 0 ||
              !Number.isInteger(warmupRamp) ||
              warmupRamp < 0 ||
              !Number.isInteger(warmupReplyRate) ||
              warmupReplyRate < 0 ||
              warmupReplyRate > 100
            }
            onClick={() =>
              void runUpdate('warmup', { settings: warmupSettings })
            }
          />
        </SettingsCard>
        </div>
      </section>

      {pasteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-select-title"
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
                <h3 id="paste-select-title" className="text-[16px] font-semibold text-ink">
                  Paste to Select
                </h3>
                <p className="mt-0.5 text-[12px] text-muted">
                  Paste domains to quickly add or remove them from your selection
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
                        pasteMode === mode ? 'bg-lime/[0.12] text-lime' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {mode} selection
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-positive">{pastedDomainResult.matched.length} matched</span>
                  {pastedDomainResult.unmatched.length > 0 && (
                    <span className="text-warn">{pastedDomainResult.unmatched.length} not found</span>
                  )}
                  {pastedDomainResult.invalid.length > 0 && (
                    <span className="text-critical">{pastedDomainResult.invalid.length} invalid</span>
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
                  {plural(pastedDomainResult.matched.length, 'domain')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
