import { useMemo, useState, type FormEvent } from 'react'
import type { DomainHealthRow } from '../types'

const fmt = (value: number) => value.toLocaleString()
const pct = (value: number) => `${value.toFixed(2)}%`
const TH =
  'whitespace-nowrap px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted/80'
const TD = 'whitespace-nowrap px-4 py-2.5 text-[13px] tnum'

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
    <div className="min-w-[155px] flex-1 px-5 py-4">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted/80">
        {label}
      </div>
      <div className={`tnum mt-1.5 font-display text-[25px] font-bold ${color}`}>
        {value}
      </div>
    </div>
  )
}

function DnsFlag({ label, valid }: { label: string; valid: boolean }) {
  return (
    <span
      className={`inline-flex min-w-[54px] items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${
        valid
          ? 'bg-positive/10 text-positive ring-positive/25'
          : 'bg-critical/10 text-critical ring-critical/25'
      }`}
    >
      <span>{valid ? '✓' : '×'}</span>
      {label}
    </span>
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
}: {
  rows: DomainHealthRow[]
  loading: boolean
  error: string | null
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onApply: () => void
}) {
  const [search, setSearch] = useState('')
  const validRange = Boolean(startDate && endDate && startDate <= endDate)
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? rows.filter((row) => row.domain.includes(query)) : rows
  }, [rows, search])

  const totals = useMemo(() => {
    const sent = rows.reduce((sum, row) => sum + row.sent, 0)
    const replied = rows.reduce((sum, row) => sum + row.replied, 0)
    const bounced = rows.reduce((sum, row) => sum + row.bounced, 0)
    return {
      sent,
      replyRate: sent > 0 ? (replied / sent) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
      dnsValidated: rows.filter((row) => row.dnsValidated).length,
    }
  }, [rows])

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
              <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">
                Domain Health
              </h2>
            </div>
            <p className="mt-1.5 pl-6 text-[11px] text-muted">
              Sending performance, warmup reputation, and DNS authentication by domain
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
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
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
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
              className="h-9 rounded-lg bg-lime-fill px-4 text-[12px] font-bold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover disabled:cursor-not-allowed disabled:opacity-50"
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
            <span className="font-semibold">Could not load domain health.</span>{' '}
            {error}
          </div>
        )}

        <div className="flex divide-x divide-line overflow-x-auto">
          <SummaryStat label="Domains" value={fmt(rows.length)} />
          <SummaryStat label="Emails sent" value={fmt(totals.sent)} tone="lime" />
          <SummaryStat
            label="Bounce rate"
            value={pct(totals.bounceRate)}
            tone={totals.bounceRate > 3 ? 'critical' : totals.bounceRate > 1 ? 'warn' : 'positive'}
          />
          <SummaryStat label="Reply rate" value={pct(totals.replyRate)} tone="positive" />
          <SummaryStat
            label="DNS validated"
            value={`${totals.dnsValidated}/${rows.length}`}
            tone={totals.dnsValidated === rows.length && rows.length > 0 ? 'positive' : 'warn'}
          />
        </div>
      </section>

      <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="h-[18px] w-[3px] rounded-full bg-lime" />
            <h3 className="font-display text-[16px] font-semibold text-ink">
              Domain Overview
            </h3>
            <span className="text-[11px] text-muted">
              {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search domain…"
              className="h-8 w-48 rounded-lg border border-line bg-panel-2 px-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-lime/60"
            />
            <span className="tnum text-[11px] text-muted">
              {filteredRows.length}/{rows.length}
            </span>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-muted">
            {search ? 'No domains match your search.' : 'No domain data found for this date range.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className={`${TH} pl-5`}>Domain</th>
                  <th className={`${TH} border-l border-line text-right`}>Accounts</th>
                  <th className={`${TH} text-right`}>Sent</th>
                  <th className={`${TH} text-right`}>Bounced</th>
                  <th className={`${TH} text-right`}>Bounce rate</th>
                  <th className={`${TH} text-right`}>Replied</th>
                  <th className={`${TH} text-right`}>Reply rate</th>
                  <th className={`${TH} border-l border-line text-right`}>Avg warmup</th>
                  <th className={`${TH} text-left`}>DNS status</th>
                  <th className={`${TH} text-center`}>Checks</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.domain}
                    className="border-b border-line-soft transition last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className={`${TD} pl-5 font-semibold text-ink`}>{row.domain}</td>
                    <td className={`${TD} border-l border-line text-right text-muted`}>
                      {fmt(row.accountCount)}
                    </td>
                    <td className={`${TD} text-right font-semibold text-ink`}>{fmt(row.sent)}</td>
                    <td className={`${TD} text-right ${row.bounced > 0 ? 'text-critical' : 'text-faint'}`}>
                      {fmt(row.bounced)}
                    </td>
                    <td
                      className={`${TD} text-right font-semibold ${
                        row.bounceRate > 3
                          ? 'text-critical'
                          : row.bounceRate > 1
                            ? 'text-warn'
                            : 'text-positive'
                      }`}
                    >
                      {pct(row.bounceRate)}
                    </td>
                    <td className={`${TD} text-right text-ink`}>{fmt(row.replied)}</td>
                    <td className={`${TD} text-right font-semibold ${row.replyRate > 0 ? 'text-positive' : 'text-faint'}`}>
                      {pct(row.replyRate)}
                    </td>
                    <td
                      className={`${TD} border-l border-line text-right font-semibold ${
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
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive ring-1 ring-inset ring-positive/25">
                          <span>✓</span> DNS validated
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-critical/10 px-2.5 py-1 text-[11px] font-semibold text-critical ring-1 ring-inset ring-critical/25"
                          title={`Missing ${row.missingDns.join(', ')}`}
                        >
                          Missing {row.missingDns.join(', ')}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-center`}>
                      <div className="flex justify-center gap-1.5">
                        <DnsFlag label="SPF" valid={row.spfVerified} />
                        <DnsFlag label="DKIM" valid={row.dkimVerified} />
                        <DnsFlag label="DMARC" valid={row.dmarcVerified} />
                      </div>
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
