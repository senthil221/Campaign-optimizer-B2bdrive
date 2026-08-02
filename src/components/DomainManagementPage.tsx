import { useEffect, useMemo, useState } from 'react'
import type {
  DomainBulkUpdateRequest,
  DomainOutboundSettings,
  DomainSettingsAction,
  DomainWarmupSettings,
  EmailAccount,
} from '../types'
import { buildDomainManagementRows } from '../utils/domainManagement'

interface Props {
  accounts: EmailAccount[]
  loading: boolean
  error: string | null
  onUpdate: (request: DomainBulkUpdateRequest) => Promise<string>
}

const INPUT =
  'h-9 w-full rounded-lg border border-line bg-panel-2 px-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/60 disabled:cursor-not-allowed disabled:opacity-50'
const LABEL =
  'mb-1 block text-[9px] font-medium uppercase tracking-[0.12em] text-muted'

function plural(count: number, word: string): string {
  const pluralWord = word === 'inbox' ? 'inboxes' : `${word}s`
  return `${count.toLocaleString()} ${count === 1 ? word : pluralWord}`
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-panel shadow-panel">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-[18px] w-[3px] rounded-full bg-lime" />
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        </div>
        <p className="mt-1.5 pl-6 text-[11px] leading-relaxed text-muted">
          {description}
        </p>
      </div>
      <div className="space-y-3 p-5">{children}</div>
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
      className="mt-1 h-9 w-full rounded-lg bg-lime-fill px-4 text-[12px] font-semibold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
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
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
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

  useEffect(() => {
    const domains = new Set(rows.map((row) => row.domain))
    setSelected(
      (current) => new Set(Array.from(current).filter((domain) => domains.has(domain))),
    )
  }, [rows])

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(
      (row) =>
        row.domain.includes(query) ||
        row.tagNames.some((tag) => tag.toLowerCase().includes(query)),
    )
  }, [rows, search])

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.domain)),
    [rows, selected],
  )
  const selectedAccounts = useMemo(
    () => selectedRows.flatMap((row) => row.accounts),
    [selectedRows],
  )
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.domain))

  const totalCapacity = rows.reduce(
    (sum, row) => sum + row.totalDailyCapacity,
    0,
  )
  const uniformDomains = rows.filter((row) => row.dailyLimit !== null).length

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
      setOperationError(
        updateError instanceof Error ? updateError.message : String(updateError),
      )
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
    <div className="space-y-5">
      <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-[22px] w-[3px] rounded-full bg-lime" />
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
                Domain Management
              </h2>
            </div>
            <p className="mt-1.5 pl-6 text-[11px] text-muted">
              Select domains, then update every inbox in those domains together.
            </p>
          </div>
          <div className="rounded-xl border border-lime/20 bg-lime/[0.07] px-4 py-2.5 text-right">
            <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
              Current selection
            </div>
            <div className="tnum mt-0.5 text-[13px] font-semibold text-lime">
              {plural(selectedRows.length, 'domain')} ·{' '}
              {plural(selectedAccounts.length, 'inbox')}
            </div>
          </div>
        </div>

        {(error || operationError) && (
          <div className="border-b border-critical/20 bg-critical/10 px-5 py-3 text-xs text-critical">
            <span className="font-semibold">Could not complete the request.</span>{' '}
            {operationError || error}
          </div>
        )}
        {notice && (
          <div className="border-b border-positive/20 bg-positive/10 px-5 py-3 text-xs text-positive">
            {notice}
          </div>
        )}

        <div className="flex divide-x divide-line overflow-x-auto">
          {[
            ['Domains', rows.length],
            ['Inboxes', accounts.length],
            ['Total capacity / day', totalCapacity],
            ['Uniform limits', uniformDomains],
          ].map(([label, value]) => (
            <div key={label} className="min-w-[160px] flex-1 px-5 py-4">
              <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
                {label}
              </div>
              <div className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-ink">
                {Number(value).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="h-[18px] w-[3px] rounded-full bg-lime" />
            <h3 className="text-[14px] font-semibold text-ink">Domains</h3>
            <span className="tnum text-[11px] text-muted">
              {visibleRows.length}/{rows.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="h-8 rounded-lg border border-line px-3 text-[11px] font-medium text-muted transition hover:text-ink"
              >
                Clear selection
              </button>
            )}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search domain or tag…"
              className="h-8 w-56 rounded-lg border border-line bg-panel-2 px-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/60"
            />
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
          <div className="px-5 py-16 text-center text-sm text-muted">
            {search ? 'No domains match your search.' : 'No inbox domains found.'}
          </div>
        ) : (
          <div className="max-h-[430px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-left">
                  <th className="w-12 px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisible}
                      aria-label="Select all visible domains"
                      className="h-3.5 w-3.5 accent-lime"
                    />
                  </th>
                  {[
                    'Domain',
                    'Inboxes',
                    'Domain daily limit',
                    'Total capacity / day',
                    'Tags',
                    'Connected',
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-3 py-2.5 text-[9px] font-medium uppercase tracking-[0.1em] text-muted/80"
                    >
                      {label}
                    </th>
                  ))}
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
                      <td className="px-5 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDomain(row.domain)}
                          aria-label={`Select ${row.domain}`}
                          className="h-3.5 w-3.5 accent-lime"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[12px] font-medium text-ink">
                        {row.domain}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-[12px] text-muted">
                        {row.accountCount.toLocaleString()}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold text-ink">
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
                      <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-[12px] text-muted">
                        {row.totalDailyCapacity.toLocaleString()}
                      </td>
                      <td
                        className="max-w-[260px] truncate px-3 py-2.5 text-[12px] text-muted"
                        title={row.tagNames.join(', ')}
                      >
                        {row.tagNames.length > 0 ? row.tagNames.join(', ') : '—'}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-2.5 text-[12px] text-muted">
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <SettingsCard
          title="Tag Management"
          description="Apply existing Smartlead tags to every inbox in the selected domains. Separate multiple tags with commas."
        >
          <label>
            <span className={LABEL}>Tags</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="warmup, client-name"
              className={INPUT}
            />
          </label>
          <p className="text-[10px] leading-relaxed text-faint">
            Tag names must already exist in Smartlead and match exactly.
          </p>
          <ApplyButton
            action="tags"
            busy={busy}
            disabled={noSelection || parsedTags.length === 0}
            onClick={() => void runUpdate('tags', { tags: parsedTags })}
          />
        </SettingsCard>

        <SettingsCard
          title="Outbound Settings"
          description="Set the daily sending limit and minimum gap for all selected inboxes. Outbound remains active."
        >
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

        <SettingsCard
          title="Warmup Settings"
          description="Bulk configure warmup volume, ramping, reply rate, and identifier while keeping warmup active."
        >
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
            <span className="text-[11px] font-medium text-muted">Enable ramp up</span>
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
    </div>
  )
}
