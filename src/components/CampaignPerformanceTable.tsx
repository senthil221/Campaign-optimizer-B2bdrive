import { Fragment, useEffect, useMemo, useState } from 'react'
import type {
  CampaignPerformance,
  CampaignSequencePayload,
  InboxReply,
  SequenceEditRequest,
  SequenceStat,
} from '../types'
import type { CampaignStatusAction, InboxQuery } from '../services/smartlead'
import CampaignInboxDrawer from './CampaignInboxDrawer'
import SequenceEditor from './SequenceEditor'
import CampaignStatusBadge from './CampaignStatusBadge'
import ColumnsMenu from './ColumnsMenu'
import StatusFilter, { type StatusOption } from './StatusFilter'
import TagFilter from './TagFilter'
import { loadStatusFilter, saveStatusFilter } from '../utils/storage'
import { leadBreakdownTitle } from './ProgressBar'
import { ProgressRing } from './ProgressRing'

interface SeqState {
  loading: boolean
  error: string | null
  data: SequenceStat[] | null
}

// Toggleable columns (the Campaign name column is always shown). Order here is
// the render order in the table and the order in the Columns menu.
export const PERF_COLUMNS = [
  { id: 'tag', label: 'Tag' },
  { id: 'status', label: 'Status' },
  { id: 'sent', label: 'Sent' },
  { id: 'replied', label: 'Replied' },
  { id: 'ooo', label: 'OOO' },
  { id: 'positive', label: 'Leads' },
  { id: 'leadRate', label: 'Lead Rate' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'maxLeads', label: 'Max leads/day' },
  { id: 'actions', label: 'Actions' },
] as const

export type ColumnId = (typeof PERF_COLUMNS)[number]['id']

interface Props {
  rows: CampaignPerformance[]
  tagOptions: string[]
  loading: boolean
  onUpdateMaxLeads: (campaignId: number, value: number) => Promise<void>
  onUpdateStatus: (campaignId: number, action: CampaignStatusAction) => Promise<void>
  fetchSequences: (campaignId: number) => Promise<SequenceStat[]>
  fetchInbox: (query: InboxQuery) => Promise<InboxReply[]>
  fetchSequenceEditor: (campaignId: number) => Promise<CampaignSequencePayload>
  saveSequenceEdit: (req: SequenceEditRequest) => Promise<CampaignSequencePayload>
  visibleCols: Record<string, boolean>
  onColumnsChange: (next: Record<string, boolean>) => void
}

/** A campaign/sequence target for the inbox drawer. */
interface InboxTarget {
  query: InboxQuery
  label: string
  totalReplied: number
}

/** The campaign whose sequences are open in the editor. */
interface EditorTarget {
  campaignId: number
  campaignName: string
}

const fmt = (n: number) => n.toLocaleString()
const pct = (n: number) => `${n.toFixed(2)}%`
// Like pct, but drops trailing zeros: 26.00 → "26%", 13.5 → "13.5%".
const cleanPct = (n: number) => `${Number(n.toFixed(2))}%`
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)

const TH = 'px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint/60 whitespace-nowrap align-middle'
const TD = 'px-4 py-1.5 whitespace-nowrap align-middle tnum tabular-nums'

const UNMAPPED = '__unmapped__'

// Status filter options. "Other" catches any unknown/empty status so nothing
// is permanently hidden. Order here is the menu order and persisted order.
const STATUS_OPTIONS: readonly StatusOption[] = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'PAUSED', label: 'Paused' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'DRAFTED', label: 'Drafted' },
  { id: 'STOPPED', label: 'Stopped' },
  { id: 'OTHER', label: 'Other' },
] as const

const KNOWN_STATUSES = new Set(
  STATUS_OPTIONS.map((o) => o.id).filter((id) => id !== 'OTHER'),
)

/** Map a raw Smartlead status to one of the filter buckets. */
function statusBucket(status: string): string {
  const key = (status || '').toUpperCase()
  return KNOWN_STATUSES.has(key) ? key : 'OTHER'
}

// ---- Dynamic sorting ----
type SortDir = 'asc' | 'desc'
type SortKey =
  | 'completion'
  | 'sent'
  | 'replied'
  | 'ooo'
  | 'positive'
  | 'leadRate'
  | 'bounced'

// The numeric a sort key reads from each row.
const SORT_VALUE: Record<SortKey, (r: CampaignPerformance) => number> = {
  completion: (r) => r.progressPercent,
  sent: (r) => r.sent,
  replied: (r) => r.replied,
  ooo: (r) => r.oooReplied,
  positive: (r) => r.interested,
  leadRate: (r) => r.leadRate,
  bounced: (r) => r.bounced,
}

// Direction applied when a column is first clicked.
const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  completion: 'asc',
  sent: 'desc',
  replied: 'desc',
  ooo: 'desc',
  positive: 'desc',
  leadRate: 'desc',
  bounced: 'desc',
}

// A metric shown as a percentage of sent, with the raw count as a faint hint.
// When onClick is given and count > 0, the count becomes a button that opens
// the inbox for those replies.
function RateCell({
  count,
  rate,
  tone,
  onClick,
}: {
  count: number
  rate: number
  tone: 'muted' | 'faint' | 'positive' | 'critical'
  onClick?: () => void
}) {
  const color =
    tone === 'critical'
      ? count > 0
        ? 'text-critical'
        : 'text-faint'
      : tone === 'positive'
        ? count > 0
          ? 'text-positive'
          : 'text-faint'
        : tone === 'muted'
          ? 'text-ink'
          : 'text-faint'
  const clickable = onClick && count > 0
  return (
    <td className={`${TD} text-right`}>
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          title="View replies"
          className={`font-semibold underline decoration-dotted decoration-faint/40 underline-offset-2 transition hover:text-lime hover:decoration-lime ${color}`}
        >
          {fmt(count)}
        </button>
      ) : (
        <span className={`font-semibold ${color}`}>{fmt(count)}</span>
      )}{' '}
      <span className="text-[11px] text-faint">({pct(rate)})</span>
    </td>
  )
}

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
        title="Live max new leads/day from Smartlead — type a number and press Enter to update"
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

// Pause / resume control. Only ACTIVE and PAUSED campaigns are actionable;
// drafted / completed / stopped campaigns show a dash.
function ActionCell({
  id,
  status,
  onUpdate,
}: {
  id: number
  status: string
  onUpdate: (id: number, action: CampaignStatusAction) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const s = (status || '').toUpperCase()
  const canPause = s === 'ACTIVE'
  const canResume = s === 'PAUSED'

  if (!canPause && !canResume) {
    return <span className="text-xs text-faint">—</span>
  }

  const action: CampaignStatusAction = canPause ? 'PAUSED' : 'START'
  const label = canPause ? 'Pause' : 'Resume'
  const run = async () => {
    setBusy(true)
    setError(false)
    try {
      await onUpdate(id, action)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const tone = canPause
    ? 'border-warn/35 text-warn hover:bg-warn/10'
    : 'border-positive/35 text-positive hover:bg-positive/10'

  return (
    <button
      onClick={run}
      disabled={busy}
      title={error ? 'Last attempt failed — click to retry' : `${label} this campaign`}
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        error ? 'border-critical/60 text-critical hover:bg-critical/10' : tone
      }`}
    >
      {busy ? (
        <span className="inline-block animate-spin">↻</span>
      ) : (
        <span className="leading-none">{canPause ? '⏸' : '▶'}</span>
      )}
      {error ? 'Retry' : label}
    </button>
  )
}

// Per-variant analytics shown when a campaign row is expanded.
function SequenceBreakdown({
  state,
  onOpenInbox,
}: {
  state: SeqState | undefined
  onOpenInbox: (seq: SequenceStat) => void
}) {
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
                  {s.replied > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenInbox(s)}
                      title="View replies for this variant"
                      className="font-medium text-muted underline decoration-dotted decoration-faint/40 underline-offset-2 transition hover:text-lime hover:decoration-lime"
                    >
                      {fmt(s.replied)}
                    </button>
                  ) : (
                    fmt(s.replied)
                  )}{' '}
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
  onUpdateStatus,
  fetchSequences,
  fetchInbox,
  fetchSequenceEditor,
  saveSequenceEdit,
  visibleCols,
  onColumnsChange,
}: Props) {
  const [search, setSearch] = useState('')
  const [inbox, setInbox] = useState<InboxTarget | null>(null)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>(() => loadStatusFilter())
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'sent',
    dir: 'desc',
  })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [seqCache, setSeqCache] = useState<Record<number, SeqState>>({})

  useEffect(() => saveStatusFilter(statusFilter), [statusFilter])

  // Click a header: same column flips direction, a new column starts at its
  // natural default (completion ascends — lowest-progress first; the rest
  // descend so the biggest numbers lead).
  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: SORT_DEFAULT_DIR[key] },
    )

  // A clickable, sort-aware table header.
  const headCell = (
    key: SortKey,
    label: string,
    opts: { left?: boolean; extra?: string; title?: string } = {},
  ) => {
    const active = sort.key === key
    const align = opts.left ? 'text-left' : 'text-right'
    return (
      <th className={`${TH} ${align} ${opts.extra ?? ''}`}>
        <button
          type="button"
          onClick={() => onSort(key)}
          title={opts.title ?? `Sort by ${label.toLowerCase()}`}
          className={`inline-flex items-center transition hover:text-ink ${active ? 'text-lime' : ''}`}
        >
          {label}
          <span
            className={`ml-1 text-[8px] leading-none ${active ? 'text-lime' : 'text-faint/40'}`}
          >
            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    )
  }

  const show = (id: ColumnId) => visibleCols[id] !== false
  // 1 = always-on Campaign column, plus every visible toggleable column.
  const colCount = 1 + PERF_COLUMNS.filter((c) => show(c.id)).length

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
    const statusSet = new Set(statusFilter)
    return rows.filter((r) => {
      if (!statusSet.has(statusBucket(r.status))) return false
      if (tagFilter.length > 0) {
        const inSelection = r.tagName ? tagFilter.includes(r.tagName) : tagFilter.includes(UNMAPPED)
        if (!inSelection) return false
      }
      if (!q) return true
      return (
        r.campaign.campaignName.toLowerCase().includes(q) ||
        String(r.campaign.campaignId).includes(q)
      )
    })
  }, [rows, search, tagFilter, statusFilter])

  const sorted = useMemo(() => {
    const val = SORT_VALUE[sort.key]
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => (val(a) - val(b)) * mul)
  }, [filtered, sort])

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel [animation-delay:80ms]">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="h-[18px] w-[3px] rounded-full bg-gradient-to-b from-lime to-lime/30" />
          <h2 className="font-display text-[16px] font-semibold leading-none tracking-[-0.02em] text-ink">
            Campaign Performance
          </h2>
        </div>
        <span className="tnum text-[11px] font-medium text-faint/50">
          {filtered.length}/{rows.length}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 border-b border-line px-5 py-2">
        {/* Search */}
        <div className="relative flex items-center">
          <svg className="absolute left-2.5 text-faint/50" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-44 rounded-lg border border-line bg-white/[0.03] pl-8 pr-3 text-[13px] text-ink placeholder:text-faint/40 outline-none transition focus:border-lime/40 focus:bg-white/[0.05]"
          />
        </div>

        {/* Tag filter */}
        <TagFilter
          options={[
            ...tagOptions.map((t) => ({ id: t, label: t })),
            { id: UNMAPPED, label: 'Untagged' },
          ]}
          selected={tagFilter}
          onChange={setTagFilter}
        />

        <StatusFilter
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onChange={setStatusFilter}
        />

        <ColumnsMenu
          columns={PERF_COLUMNS}
          visibleCols={visibleCols}
          onColumnsChange={onColumnsChange}
        />
      </div>

      {/* Table */}
      <div className="max-h-[64vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2/95 backdrop-blur-sm">
            <tr className="border-b border-line">
              {headCell('completion', 'Campaign', {
                left: true,
                extra: 'pl-5',
                title: 'Sort by completion %',
              })}
              {show('tag') && <th className={`${TH} text-left`}>Tag</th>}
              {show('status') && <th className={`${TH} text-left`}>Status</th>}
              {show('sent') && headCell('sent', 'Sent')}
              {show('replied') && headCell('replied', 'Replied')}
              {show('ooo') && headCell('ooo', 'OOO')}
              {show('positive') && headCell('positive', 'Leads')}
              {show('leadRate') && headCell('leadRate', 'Lead Rate')}
              {show('bounced') && headCell('bounced', 'Bounced')}
              {show('maxLeads') && (
                <th className={`${TH} border-l border-line/60 text-right`}>Max leads/day</th>
              )}
              {show('actions') && (
                <th className={`${TH} pr-5 text-right`}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-line-soft">
                  <td colSpan={colCount} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-white/5" />
                  </td>
                </tr>
              ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-14 text-center text-sm text-faint">
                  No campaigns match the current filter.
                </td>
              </tr>
            )}

            {sorted.map((r) => {
              const c = r.campaign
              const isOpen = expanded === c.campaignId
              return (
                <Fragment key={c.campaignId}>
                <tr
                  className={`group border-b border-line-soft transition-colors last:border-0 hover:bg-white/[0.03] ${
                    isOpen ? 'bg-white/[0.03]' : ''
                  }`}
                >
                  <td className="max-w-[360px] px-4 py-1.5 pl-3 align-middle">
                    <div className="group/name flex items-center gap-2.5">
                      <span title={leadBreakdownTitle(c)} className="shrink-0">
                        <ProgressRing percent={r.progressPercent} />
                      </span>
                      <button
                        onClick={() => toggleExpand(c.campaignId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                      <button
                        onClick={() =>
                          setEditor({
                            campaignId: c.campaignId,
                            campaignName: c.campaignName,
                          })
                        }
                        title="Manage sequences — enable/disable variants and edit copy"
                        aria-label={`Manage sequences for ${c.campaignName}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line text-faint opacity-0 transition hover:border-lime/40 hover:text-lime focus:opacity-100 group-hover/name:opacity-100"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path
                            d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>

                  {show('tag') && (
                    <td className="px-4 py-2 align-middle">
                      {r.tagName ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex max-w-[150px] items-center gap-1.5 truncate rounded-md border border-line bg-white/[0.03] px-2 py-0.5 text-xs font-medium text-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime/70" />
                            <span className="truncate">{r.tagName}</span>
                          </span>
                          {r.tagVolume != null && r.tagVolume > 0 && (
                            <span
                              className="tnum whitespace-nowrap text-[11px] font-medium text-faint"
                              title={`~${fmt(Math.round(r.tagVolume / 2))} prospects/day you can reach with the "${r.tagName}" pool (${fmt(r.tagVolume)} emails/day ÷ 2 for follow-ups)`}
                            >
                              {fmt(Math.round(r.tagVolume / 2))}/day
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-faint">Untagged</span>
                      )}
                    </td>
                  )}

                  {show('status') && (
                    <td className="px-4 py-2 align-middle">
                      <CampaignStatusBadge status={r.status} />
                    </td>
                  )}

                  {show('sent') && (
                    <td className={`${TD} text-right font-semibold text-ink`}>{fmt(r.sent)}</td>
                  )}
                  {show('replied') && (
                    <RateCell
                      count={r.replied}
                      rate={r.repliedRate}
                      tone="muted"
                      onClick={() =>
                        setInbox({
                          query: { campaignId: c.campaignId },
                          label: c.campaignName,
                          totalReplied: r.replied,
                        })
                      }
                    />
                  )}
                  {show('ooo') && (
                    <RateCell count={r.oooReplied} rate={r.oooRate} tone="faint" />
                  )}
                  {show('positive') && (
                    <td className={`${TD} text-right`}>
                      <span
                        className={`font-semibold ${r.interested > 0 ? 'text-positive' : 'text-faint'}`}
                      >
                        {fmt(r.interested)}
                      </span>
                    </td>
                  )}
                  {show('leadRate') && (
                    <td className={`${TD} text-right`}>
                      <span
                        className={`tnum inline-flex min-w-[56px] justify-end rounded-md px-2 py-0.5 text-xs font-semibold ${
                          r.leadRate > 0 ? 'bg-positive/10 text-positive' : 'text-faint'
                        }`}
                      >
                        {cleanPct(r.leadRate)}
                      </span>
                    </td>
                  )}
                  {show('bounced') && (
                    <RateCell count={r.bounced} rate={r.bounceRate} tone="critical" />
                  )}

                  {show('maxLeads') && (
                    <td className="border-l border-line px-4 py-2 align-middle">
                      <MaxLeadsCell
                        id={c.campaignId}
                        value={r.maxLeadsPerDay}
                        onUpdate={onUpdateMaxLeads}
                      />
                    </td>
                  )}

                  {show('actions') && (
                    <td className="px-4 py-2 pr-5 text-right align-middle">
                      <ActionCell
                        id={c.campaignId}
                        status={r.status}
                        onUpdate={onUpdateStatus}
                      />
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={colCount} className="p-0">
                      <SequenceBreakdown
                        state={seqCache[c.campaignId]}
                        onOpenInbox={(s) =>
                          setInbox({
                            query: {
                              campaignId: c.campaignId,
                              seqId: s.emailCampaignSeqId || undefined,
                              variantId: s.seqVariantId || undefined,
                            },
                            label: `${c.campaignName} · Email ${s.seqNumber}${
                              s.variantLabel ? ` – ${s.variantLabel}` : ''
                            }`,
                            totalReplied: s.replied,
                          })
                        }
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <CampaignInboxDrawer
        query={inbox?.query ?? null}
        label={inbox?.label ?? ''}
        totalReplied={inbox?.totalReplied}
        onClose={() => setInbox(null)}
        fetchInbox={fetchInbox}
      />

      <SequenceEditor
        campaignId={editor?.campaignId ?? null}
        campaignName={editor?.campaignName ?? ''}
        onClose={() => setEditor(null)}
        fetchEditor={fetchSequenceEditor}
        saveEdit={saveSequenceEdit}
      />
    </section>
  )
}
