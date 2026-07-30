import { useMemo, useState, type FormEvent } from 'react'
import type { DomainHealthRow } from '../types'

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
  onPreset: (days: 1 | 3) => void
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('bounceRate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const validRange = Boolean(startDate && endDate && startDate <= endDate)
  const now = new Date()
  const today = IST_DATE_FORMAT.format(now)
  const threeDaysAgo = IST_DATE_FORMAT.format(
    new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
  )
  const activePreset =
    startDate === today && endDate === today
      ? 'today'
      : startDate === threeDaysAgo && endDate === today
        ? '3d'
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
          <div className="flex items-center gap-2">
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
                  <SortHeader
                    label="Domain"
                    sortKey="domain"
                    activeKey={sortKey}
                    direction={sortDirection}
                    align="left"
                    className="pl-5"
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
                {visibleRows.map((row) => (
                  <tr
                    key={row.domain}
                    className="border-b border-line-soft transition last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className={`${TD} pl-5 font-medium text-ink`}>
                      {row.domain}
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
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-critical/10 px-2.5 py-1 text-[10px] font-medium text-critical ring-1 ring-inset ring-critical/25"
                          title={inboxRiskTitle(row)}
                        >
                          <span>!</span>
                          {fmt(row.inboxRisk.total)} /{' '}
                          {fmt(row.inboxRisk.affectedInboxes)}
                        </span>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
