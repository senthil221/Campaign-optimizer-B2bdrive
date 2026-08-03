import { useEffect, useMemo, useState } from 'react'
import type {
  DomainBulkUpdateRequest,
  DomainOutboundSettings,
  DomainSettingsAction,
  DomainWarmupSettings,
  EmailAccount,
} from '../types'
import {
  buildDomainManagementRows,
  domainFromEmail,
  isValidDomain,
} from '../utils/domainManagement'

interface Props {
  accounts: EmailAccount[]
  loading: boolean
  error: string | null
  onUpdate: (request: DomainBulkUpdateRequest) => Promise<string>
}

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-panel-2 px-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/60 disabled:cursor-not-allowed disabled:opacity-50'
const LABEL =
  'mb-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-muted'

type SortKey = 'domain' | 'ageDays' | 'dailyLimit' | 'totalDailyCapacity' | 'connected'
type SortDirection = 'asc' | 'desc'
type OpenFilter = 'tags' | 'warmup' | null

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

function FilterMenu({
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  open: boolean
  onToggle: () => void
  onChange: (value: string) => void
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label
  const active = value !== 'all'

  return (
    <div className="relative">
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
                onClick={() => onChange(option.value)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[10px] transition hover:bg-white/[0.05] ${
                  option.value === value ? 'bg-lime/[0.08] text-lime' : 'text-muted'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && <span>✓</span>}
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
    outbound: 'Update outbound settings',
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
  loading,
  error,
  onUpdate,
}: Props) {
  const rows = useMemo(() => buildDomainManagementRows(accounts), [accounts])
  const [tagFilter, setTagFilter] = useState('all')
  const [warmupFilter, setWarmupFilter] = useState('all')
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null)
  const [sortKey, setSortKey] = useState<SortKey>('domain')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pastedDomains, setPastedDomains] = useState('')
  const [pasteMode, setPasteMode] = useState<'add' | 'replace'>('add')
  const [busy, setBusy] = useState<DomainSettingsAction | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tags, setTags] = useState('')
  const [messagePerDay, setMessagePerDay] = useState(9)
  const [minTimeToWaitInMins, setMinTimeToWaitInMins] = useState(60)
  const [warmupMax, setWarmupMax] = useState(5)
  const [warmupRamp, setWarmupRamp] = useState(1)
  const [warmupReplyRate, setWarmupReplyRate] = useState(60)
  const [warmupTag, setWarmupTag] = useState('hey-there')
  const [rampupEnabled, setRampupEnabled] = useState(true)
  const [serverKnownTags, setServerKnownTags] = useState<string[]>([])

  useEffect(() => {
    const domains = new Set(rows.map((row) => row.domain))
    setSelected(
      (current) => new Set(Array.from(current).filter((domain) => domains.has(domain))),
    )
  }, [rows])

  const knownTags = useMemo(
    () =>
      Array.from(new Set(accounts.flatMap((account) => account.tagNames))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [accounts],
  )
  const selectableTags = useMemo(
    () =>
      Array.from(new Set([...knownTags, ...serverKnownTags])).sort((a, b) =>
        a.localeCompare(b),
      ),
    [knownTags, serverKnownTags],
  )
  const tagFilterOptions = useMemo<FilterOption[]>(
    () => [
      { value: 'all', label: 'All tags' },
      { value: 'untagged', label: 'Untagged' },
      ...knownTags.map((tag) => ({ value: tag, label: tag })),
    ],
    [knownTags],
  )
  const warmupFilterOptions: FilterOption[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Disabled' },
    { value: 'mixed', label: 'Mixed' },
  ]
  const invalidDomainAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => !isValidDomain(domainFromEmail(account.fromEmail)),
      ),
    [accounts],
  )

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (tagFilter === 'untagged' && row.tagNames.length > 0) return false
      if (
        tagFilter !== 'all' &&
        tagFilter !== 'untagged' &&
        !row.tagNames.includes(tagFilter)
      )
        return false
      if (warmupFilter !== 'all' && row.warmupState !== warmupFilter) return false
      return true
    })

    return [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortKey === 'domain') comparison = a.domain.localeCompare(b.domain)
      if (sortKey === 'ageDays') {
        if (a.ageDays === null && b.ageDays === null) comparison = 0
        else if (a.ageDays === null) comparison = 1
        else if (b.ageDays === null) comparison = -1
        else comparison = a.ageDays - b.ageDays
      }
      if (sortKey === 'dailyLimit') {
        comparison = (a.dailyLimit ?? a.dailyLimitMin) - (b.dailyLimit ?? b.dailyLimitMin)
      }
      if (sortKey === 'totalDailyCapacity') {
        comparison = a.totalDailyCapacity - b.totalDailyCapacity
      }
      if (sortKey === 'connected') {
        comparison = a.connectedCount / a.accountCount - b.connectedCount / b.accountCount
      }
      if (comparison === 0) comparison = a.domain.localeCompare(b.domain)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [rows, sortDirection, sortKey, tagFilter, warmupFilter])

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

  const totalCapacity = rows.reduce(
    (sum, row) => sum + row.totalDailyCapacity,
    0,
  )
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
  const filtersActive = tagFilter !== 'all' || warmupFilter !== 'all'

  const clearFilters = () => {
    setTagFilter('all')
    setWarmupFilter('all')
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
    setSelected((current) => {
      const next = pasteMode === 'replace' ? new Set<string>() : new Set(current)
      pastedDomainResult.matched.forEach((domain) => next.add(domain))
      return next
    })
    setPasteOpen(false)
    setPastedDomains('')
  }

  const toggleDomain = (domain: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  const toggleVisible = () => {
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
      setNotice(message)
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
    } finally {
      setBusy(null)
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
  const knownTagSet = new Set(selectableTags)
  const invalidTags = parsedTags.filter((tag) => !knownTagSet.has(tag))
  const tagInputError =
    tags.trim() && invalidTags.length > 0
      ? `Unknown Smartlead tag${invalidTags.length === 1 ? '' : 's'}: ${invalidTags.join(', ')}`
      : null
  const noSelection = selectedRows.length === 0

  const outboundSettings: DomainOutboundSettings = {
    messagePerDay,
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
      <section className="animate-rise overflow-hidden rounded-xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="mr-auto flex items-center gap-3">
            <span className="h-[18px] w-[3px] rounded-full bg-lime" />
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Domain Management
            </h2>
          </div>
          {[
            ['Domains', rows.length.toLocaleString()],
            ['Avg age', formatDomainAge(averageDomainAge)],
            ['Total cap', totalCapacity.toLocaleString()],
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
        {notice && (
          <div className="border-t border-positive/20 bg-positive/10 px-4 py-2 text-[11px] text-positive">
            {notice}
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
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <FilterMenu
              label="Tags"
              value={tagFilter}
              options={tagFilterOptions}
              open={openFilter === 'tags'}
              onToggle={() => setOpenFilter((current) => current === 'tags' ? null : 'tags')}
              onChange={(value) => {
                setTagFilter(value)
                setOpenFilter(null)
              }}
            />
            <FilterMenu
              label="Warmup"
              value={warmupFilter}
              options={warmupFilterOptions}
              open={openFilter === 'warmup'}
              onToggle={() => setOpenFilter((current) => current === 'warmup' ? null : 'warmup')}
              onChange={(value) => {
                setWarmupFilter(value)
                setOpenFilter(null)
              }}
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
                onClick={() => setSelected(new Set())}
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
            <table className="w-full min-w-[1080px] border-collapse">
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
                  <SortHeader label="Domain age" sortKey="ageDays" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Daily limit" sortKey="dailyLimit" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <SortHeader label="Total cap" sortKey="totalDailyCapacity" activeKey={sortKey} direction={sortDirection} onSort={sortBy} align="right" />
                  <th className="whitespace-nowrap px-2.5 py-2.5 text-left text-[9px] font-medium uppercase tracking-[0.1em] text-muted/80">Tags</th>
                  <SortHeader label="Connected" sortKey="connected" activeKey={sortKey} direction={sortDirection} onSort={sortBy} />
                  <th className="whitespace-nowrap px-2.5 py-2.5 text-left text-[9px] font-medium uppercase tracking-[0.1em] text-muted/80">Warmup status</th>
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
                          onChange={() => toggleDomain(row.domain)}
                          aria-label={`Select ${row.domain}`}
                          className="h-3.5 w-3.5 accent-lime"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-[11px] font-medium text-ink">
                        {row.domain}
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
                      <td className="tnum whitespace-nowrap px-2.5 py-2 text-right text-[11px] text-muted">
                        {row.totalDailyCapacity.toLocaleString()}
                      </td>
                      <td
                        className="max-w-[240px] truncate px-2.5 py-2 text-[11px] text-muted"
                        title={row.tagNames.join(', ')}
                      >
                        {row.tagNames.length > 0 ? row.tagNames.join(', ') : '—'}
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
          <div className="flex items-center justify-between">
            <span className={LABEL.replace('mb-1 ', '')}>Available tags</span>
            <span className="tnum text-[9px] text-faint">{selectableTags.length}</span>
          </div>
          <div className="max-h-28 min-h-16 overflow-y-auto overscroll-contain rounded-lg border border-line bg-panel-2 p-2">
            <div className="flex flex-wrap gap-1.5">
              {selectableTags.length > 0 ? (
                selectableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setTags(Array.from(new Set([...parsedTags, tag])).join(', '))
                    }
                    className="rounded-md border border-line bg-panel px-2 py-1 text-[10px] text-muted transition hover:border-lime/30 hover:text-lime"
                  >
                    {tag}
                  </button>
                ))
              ) : (
                <span className="px-1 text-[9px] text-faint">No tags loaded</span>
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
            <label>
              <span className={LABEL}>Max emails / day</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={messagePerDay}
                onChange={(event) => setMessagePerDay(Number(event.target.value))}
                className={INPUT}
              />
            </label>
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
          </div>
          <ApplyButton
            action="outbound"
            busy={busy}
            disabled={
              noSelection ||
              !Number.isInteger(messagePerDay) ||
              messagePerDay < 0 ||
              !Number.isInteger(minTimeToWaitInMins) ||
              minTimeToWaitInMins < 0
            }
            onClick={() =>
              void runUpdate('outbound', { settings: outboundSettings })
            }
          />
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
                  Paste domains to quickly select them
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
                  {(['add', 'replace'] as const).map((mode) => (
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
                  Select {plural(pastedDomainResult.matched.length, 'domain')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
