import { Fragment, useMemo, useState } from 'react'
import type { CampaignPerformance, SequenceStat } from '../types'

interface SeqState {
  loading: boolean
  error: string | null
  data: SequenceStat[] | null
}

interface Props {
  rows: CampaignPerformance[]
  tagOptions: string[]
  loading: boolean
  onUpdateMaxLeads: (campaignId: number, value: number) => Promise<void>
  fetchSequences: (campaignId: number) => Promise<SequenceStat[]>
}

const fmt = (n: number) => n.toLocaleString()
const pct = (n: number) => `${n.toFixed(2)}%`
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)

const TH = 'px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint whitespace-nowrap align-middle'
const TD = 'px-4 py-2 whitespace-nowrap align-middle tnum tabular-nums'

const inputCls =
  'h-9 rounded-xl border border-line bg-base px-3 text-sm text-ink placeholder:text-faint outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/25'

const UNMAPPED = '__unmapped__'

// Inline editor for max new leads/day. Shows the value formatted; focusing
// turns it into a plain digit field. Commits on Enter/blur, cancels on Esc.
function MaxLeadsCell({
  id,
  value,
  onUpdate,
}: {
  id: number
  value: number | null
  onUpdate: (id: number, value: number) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const shown = focused
    ? draft
    : value == null
      ? ''
      : value.toLocaleString()

  const commit = async () => {
    setFocused(false)
    const clean = draft.replace(/[^\d]/g, '')
    if (clean === '') return
    const n = Number(clean)
    if (!Number.isFinite(n) || (value != null && n === value)) return
    setState('saving')
    try {
      await onUpdate(id, n)
      setState('saved')
      setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('error')
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <div
        className={`flex h-8 w-[104px] items-center rounded-lg border bg-base pl-2.5 pr-1 transition focus-within:border-lime/50 focus-within:ring-1 focus-within:ring-lime/25 ${
          state === 'error' ? 'border-critical/60' : 'border-line'
        }`}
      >
        <input
          type="text"
          inputMode="numeric"
          value={shown}
          placeholder="—"
          aria-label="Max new leads per day"
          onFocus={() => {
            setFocused(true)
            setDraft(value == null ? '' : String(value))
            if (state !== 'idle') setState('idle')
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setDraft(value == null ? '' : String(value))
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          onBlur={commit}
          className="tnum w-full bg-transparent text-right text-[13px] font-medium text-ink outline-none placeholder:text-faint"
        />
        <span className="w-4 shrink-0 text-center text-xs leading-none">
          {state === 'saving' && (
            <span className="inline-block animate-spin text-faint">↻</span>
          )}
          {state === 'saved' && <span className="text-positive">✓</span>}
          {state === 'error' && (
            <span className="text-critical" title="Save failed — click to retry">
              !
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

// Per-variant analytics shown when a campaign row is expanded.
function SequenceBreakdown({ state }: { state: SeqState | undefined }) {
  if (!state || state.loading) {
    return (
      <div className="space-y-1.5 px-6 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    )
  }
  if (state.error) {
    return (
      <div className="px-6 py-4 text-xs text-critical">
        Couldn’t load variant performance: {state.error}
      </div>
    )
  }
  const rows = state.data ?? []
  if (rows.length === 0) {
    return <div className="px-6 py-4 text-xs text-faint">No sequence data.</div>
  }

  const SH = 'px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-faint whitespace-nowrap'
  const SD = 'px-3 py-1.5 whitespace-nowrap tnum tabular-nums text-[12px]'

  return (
    <div className="border-l-2 border-lime/30 bg-base/60 px-4 py-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        Variant performance
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line-soft">
            <th className={`${SH} text-left`}>Sequence</th>
            <th className={`${SH} text-right`}>Sent</th>
            <th className={`${SH} text-right`}>Replied</th>
            <th className={`${SH} text-right`}>Positive</th>
            <th className={`${SH} text-right`}>Bounced</th>
            <th className={`${SH} text-right`}>Sender bnc.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const label = `${s.seqNumber}. Email${s.variantLabel ? ` – ${s.variantLabel}` : ''}`
            return (
              <tr key={s.id} className="border-b border-line-soft last:border-0">
                <td className={`${SD} font-medium text-ink`}>{label}</td>
                <td className={`${SD} text-right text-ink`}>{fmt(s.sent)}</td>
                <td className={`${SD} text-right text-muted`}>
                  {fmt(s.replied)}{' '}
                  <span className="text-faint">({pct(ratio(s.replied, s.sent))})</span>
                </td>
                <td className={`${SD} text-right ${s.positiveReplies > 0 ? 'text-positive' : 'text-faint'}`}>
                  {fmt(s.positiveReplies)}{' '}
                  <span className="opacity-70">({pct(ratio(s.positiveReplies, s.replied))})</span>
                </td>
                <td className={`${SD} text-right ${s.bounced > 0 ? 'text-critical' : 'text-faint'}`}>
                  {fmt(s.bounced)}{' '}
                  <span className="opacity-70">({pct(ratio(s.bounced, s.sent))})</span>
                </td>
                <td className={`${SD} text-right ${s.senderBounced > 0 ? 'text-critical' : 'text-faint'}`}>
                  {fmt(s.senderBounced)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function CampaignPerformanceTable({
  rows,
  tagOptions,
  loading,
  onUpdateMaxLeads,
  fetchSequences,
}: Props) {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [seqCache, setSeqCache] = useState<Record<number, SeqState>>({})

  const toggleExpand = (id: number) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    const cached = seqCache[id]
    if (!cached || (cached.error && !cached.loading)) {
      setSeqCache((p) => ({ ...p, [id]: { loading: true, error: null, data: null } }))
      fetchSequences(id)
        .then((data) =>
          setSeqCache((p) => ({ ...p, [id]: { loading: false, error: null, data } })),
        )
        .catch((e) =>
          setSeqCache((p) => ({
            ...p,
            [id]: {
              loading: false,
              error: e instanceof Error ? e.message : String(e),
              data: null,
            },
          })),
        )
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (tagFilter === UNMAPPED && r.tagName) return false
      if (tagFilter && tagFilter !== UNMAPPED && r.tagName !== tagFilter) return false
      if (!q) return true
      return (
        r.campaign.campaignName.toLowerCase().includes(q) ||
        String(r.campaign.campaignId).includes(q)
      )
    })
  }, [rows, search, tagFilter])

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel [animation-delay:80ms]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-4 w-[3px] rounded-full bg-lime" />
          <h2 className="font-display text-[19px] font-semibold leading-none tracking-[-0.01em] text-ink">
            Campaign Performance
          </h2>
          <span className="text-[12px] font-medium text-faint">
            Lead Rate = Interested ÷ Sent
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaign or ID…"
          className={`${inputCls} w-56`}
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className={`${inputCls} w-48`}
        >
          <option value="">All tags</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={UNMAPPED}>— Untagged —</option>
        </select>
        <span className="ml-auto tnum text-xs font-medium text-faint">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="max-h-[64vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2">
            <tr className="border-b border-line">
              <th className={`${TH} pl-5 text-left`}>Campaign</th>
              <th className={`${TH} text-left`}>Tag</th>
              <th className={`${TH} text-right`}>Sent</th>
              <th className={`${TH} text-right`}>Replied</th>
              <th className={`${TH} text-right`}>OOO</th>
              <th className={`${TH} text-right`}>Positive</th>
              <th className={`${TH} text-right`}>Lead Rate</th>
              <th className={`${TH} text-right`}>Bounced</th>
              <th className={`${TH} border-l border-line pr-5 text-right`}>Max&nbsp;leads/day</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-line-soft">
                  <td colSpan={9} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-white/5" />
                  </td>
                </tr>
              ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-14 text-center text-sm text-faint">
                  No campaigns match the current filter.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const c = r.campaign
              const isOpen = expanded === c.campaignId
              return (
                <Fragment key={c.campaignId}>
                <tr
                  className={`border-b border-line-soft transition last:border-0 hover:bg-white/[0.022] ${
                    isOpen ? 'bg-white/[0.03]' : ''
                  }`}
                >
                  <td className="max-w-[320px] px-4 py-2 pl-3 align-middle">
                    <button
                      onClick={() => toggleExpand(c.campaignId)}
                      className="flex w-full items-center gap-2 text-left"
                      title="Show variant performance"
                    >
                      <span
                        className={`shrink-0 text-faint transition-transform ${isOpen ? 'rotate-90 text-lime' : ''}`}
                      >
                        ›
                      </span>
                      <span
                        className="truncate font-medium text-ink"
                        title={`${c.campaignName} · #${c.campaignId}`}
                      >
                        {c.campaignName}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    {r.tagName ? (
                      <span className="inline-flex max-w-[160px] items-center gap-1.5 truncate rounded-md border border-line bg-white/[0.03] px-2 py-0.5 text-xs font-medium text-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime/70" />
                        <span className="truncate">{r.tagName}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-faint">Untagged</span>
                    )}
                  </td>
                  <td className={`${TD} text-right font-semibold text-ink`}>{fmt(r.sent)}</td>
                  <td className={`${TD} text-right text-muted`}>{fmt(r.replied)}</td>
                  <td className={`${TD} text-right text-faint`}>{fmt(r.oooReplied)}</td>
                  <td className={`${TD} text-right font-semibold ${
                    r.interested > 0 ? 'text-positive' : 'text-faint'
                  }`}>
                    {fmt(r.interested)}
                  </td>
                  <td className={`${TD} text-right`}>
                    <span
                      className={`tnum inline-flex min-w-[56px] justify-end rounded-md px-2 py-0.5 text-xs font-semibold ${
                        r.leadRate > 0 ? 'bg-positive/10 text-positive' : 'text-faint'
                      }`}
                    >
                      {pct(r.leadRate)}
                    </span>
                  </td>
                  <td className={`${TD} text-right ${
                    r.bounced > 0 ? 'text-critical' : 'text-faint'
                  }`}>
                    {fmt(r.bounced)}
                  </td>
                  <td className="border-l border-line px-4 py-2 pr-5 align-middle">
                    <MaxLeadsCell
                      id={c.campaignId}
                      value={r.maxLeadsPerDay}
                      onUpdate={onUpdateMaxLeads}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <SequenceBreakdown state={seqCache[c.campaignId]} />
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
