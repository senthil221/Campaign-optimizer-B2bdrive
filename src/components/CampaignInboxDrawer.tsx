import { useCallback, useEffect, useRef, useState } from 'react'
import type { InboxReply } from '../types'
import type { InboxQuery } from '../services/smartlead'

const PAGE_SIZE = 20

interface Props {
  /** Non-null opens the drawer and identifies which replies to load. */
  query: InboxQuery | null
  /** Heading shown at the top — campaign name, optionally a sequence label. */
  label: string
  /** Replied count for the header hint (from the row that was clicked). */
  totalReplied?: number
  onClose: () => void
  fetchInbox: (query: InboxQuery) => Promise<InboxReply[]>
}

// "2026-07-10T15:13:00+00:00" → "Jul 10, 3:13 PM"
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function initials(name: string, email: string): string {
  const src = name.trim() || email
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  const a = parts[0]?.[0] ?? '?'
  const b = parts.length > 1 ? parts[1][0] : ''
  return (a + b).toUpperCase()
}

// A prospect's reply. Collapsed shows a one-line snippet; expanded shows the
// message we sent and the full reply thread side by side.
function ReplyCard({ r }: { r: InboxReply }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={`rounded-xl border transition ${
        open ? 'border-lime/30 bg-white/[0.03]' : 'border-line bg-white/[0.015] hover:border-line'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
      >
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-[11px] font-semibold text-muted">
          {initials(r.leadName, r.leadEmail)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">
              {r.leadName || r.leadEmail || 'Unknown'}
            </span>
            <span className="shrink-0 rounded-md border border-line bg-white/[0.03] px-1.5 py-px text-[10px] font-medium text-faint">
              Email {r.seqNumber || '?'}
            </span>
            {r.isBounced && (
              <span className="shrink-0 rounded-md bg-critical/10 px-1.5 py-px text-[10px] font-semibold text-critical">
                Bounced
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-faint">{r.leadEmail}</div>
          <div className="mt-1 line-clamp-2 whitespace-pre-line text-[12.5px] leading-snug text-muted">
            {r.replySnippet || '(no text)'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum whitespace-nowrap text-[11px] text-faint">
            {fmtTime(r.replyTime)}
          </div>
          <span
            className={`mt-1 inline-block text-faint transition-transform ${open ? 'rotate-90 text-lime' : ''}`}
          >
            ›
          </span>
        </div>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-line-soft px-3.5 py-3 md:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-faint/60" />
              Sent · {fmtTime(r.sentTime)}
            </div>
            <div className="mb-1 truncate text-[11px] text-faint" title={r.fromEmail}>
              from {r.fromEmail || '—'}
            </div>
            <div className="max-h-56 overflow-auto whitespace-pre-line rounded-lg border border-line-soft bg-base/60 px-3 py-2 text-[12px] leading-relaxed text-muted">
              {r.subject && (
                <div className="mb-1 font-semibold text-ink/90">{r.subject}</div>
              )}
              {r.sentBody || '(no body)'}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-lime/80">
              <span className="h-1.5 w-1.5 rounded-full bg-lime/70" />
              Reply · {fmtTime(r.replyTime)}
            </div>
            <div className="mb-1 truncate text-[11px] text-faint" title={r.leadEmail}>
              from {r.leadEmail || '—'}
            </div>
            <div className="max-h-56 overflow-auto whitespace-pre-line rounded-lg border border-lime/15 bg-lime/[0.03] px-3 py-2 text-[12px] leading-relaxed text-ink/90">
              {r.replyText || r.replySnippet || '(no text)'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CampaignInboxDrawer({
  query,
  label,
  totalReplied,
  onClose,
  fetchInbox,
}: Props) {
  const [replies, setReplies] = useState<InboxReply[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  // Identity of the current open request, so a stale response can't land after
  // the user re-opens the drawer on a different row.
  const reqIdRef = useRef(0)

  const load = useCallback(
    async (q: InboxQuery, offset: number) => {
      const reqId = ++reqIdRef.current
      if (offset === 0) {
        setLoading(true)
        setReplies([])
        setError(null)
        setHasMore(false)
      } else {
        setLoadingMore(true)
      }
      try {
        const page = await fetchInbox({ ...q, offset, limit: PAGE_SIZE })
        if (reqId !== reqIdRef.current) return
        setReplies((prev) => (offset === 0 ? page : [...prev, ...page]))
        setHasMore(page.length === PAGE_SIZE)
      } catch (e) {
        if (reqId !== reqIdRef.current) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [fetchInbox],
  )

  // (Re)load whenever the target changes.
  useEffect(() => {
    if (!query) return
    void load(query, 0)
  }, [query, load])

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!query) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [query, onClose])

  if (!query) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="relative flex h-full w-full max-w-[640px] flex-col border-l border-line bg-panel shadow-panel animate-rise [animation-duration:0.35s]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lime/80">
              <span className="h-[14px] w-[3px] rounded-full bg-gradient-to-b from-lime to-lime/30" />
              Inbox
            </div>
            <h2
              className="mt-1 truncate font-display text-[16px] font-semibold tracking-[-0.02em] text-ink"
              title={label}
            >
              {label}
            </h2>
            <div className="mt-0.5 text-[11px] text-faint">
              {loading
                ? 'Loading replies…'
                : `Showing ${replies.length}${hasMore ? '+' : ''} repl${replies.length === 1 ? 'y' : 'ies'}${
                    totalReplied != null ? ` of ${totalReplied.toLocaleString()}` : ''
                  } · newest first`}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close inbox"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-faint transition hover:border-line hover:bg-white/[0.04] hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-2 overflow-auto px-4 py-4">
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[68px] animate-pulse rounded-xl bg-white/[0.03]" />
            ))}

          {!loading && error && (
            <div className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-xs text-critical">
              Couldn’t load the inbox: {error}
            </div>
          )}

          {!loading && !error && replies.length === 0 && (
            <div className="grid place-items-center px-4 py-20 text-center">
              <div className="text-3xl opacity-30">✉</div>
              <div className="mt-2 text-sm text-faint">No replies yet.</div>
            </div>
          )}

          {!loading &&
            !error &&
            replies.map((r) => <ReplyCard key={r.id} r={r} />)}

          {!loading && !error && hasMore && (
            <button
              onClick={() => query && load(query, replies.length)}
              disabled={loadingMore}
              className="mt-1 w-full rounded-xl border border-line bg-white/[0.02] py-2.5 text-[13px] font-medium text-muted transition hover:border-lime/30 hover:text-ink disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
