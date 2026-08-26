import { useCallback, useEffect, useRef, useState } from 'react'
import type { InboxReply } from '../types'
import type { InboxQuery } from '../services/smartlead'
import Portal from './Portal'

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Render email content faithfully but safely. The HTML comes from external
 * senders, so it goes into a sandboxed iframe (no scripts, no same-origin
 * access) on the white background emails are designed for. Falls back to
 * escaped plain text when there's no HTML body.
 */
function SafeHtmlFrame({
  html,
  text,
  className = '',
}: {
  html: string
  text: string
  className?: string
}) {
  const body = html.trim()
    ? html
    : `<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;margin:0">${escapeHtml(text)}</pre>`
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;background:#fff;padding:16px;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#2563eb}table{max-width:100%}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e2e2e2;color:#555}</style></head><body>${body}</body></html>`
  return (
    <iframe
      title="Email content"
      // Empty sandbox = maximally locked down: scripts disabled, no parent access.
      sandbox=""
      srcDoc={srcDoc}
      className={`w-full rounded-lg border border-line-soft bg-white ${className}`}
    />
  )
}

// A prospect's reply, always shown in full — no expand step and no copy of the
// message we sent, so a whole variant's replies can be read straight down the
// list. "Full screen" is kept for replies whose original HTML matters.
function ReplyCard({
  r,
  onFullscreen,
}: {
  r: InboxReply
  onFullscreen: () => void
}) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.015]">
      <div className="flex items-start gap-3 px-3.5 py-3">
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="tnum whitespace-nowrap text-[11px] text-faint">
            {fmtTime(r.replyTime)}
          </div>
          <button
            onClick={onFullscreen}
            title="Open this reply as its original HTML"
            className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-faint transition hover:border-lime/40 hover:text-lime"
          >
            <span className="leading-none">⛶</span>
          </button>
        </div>
      </div>

      <div className="border-t border-line-soft px-3.5 py-3">
        <div className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink/90">
          {r.replySnippet || r.replyText || '(no text)'}
        </div>
      </div>
    </div>
  )
}

// Full-screen reader for one reply: renders the prospect's real email HTML in a
// sandboxed frame so nothing is compressed or lost.
function ReplyFullScreen({ r, onClose }: { r: InboxReply; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full max-h-[900px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-semibold text-ink">
              {r.subject || '(no subject)'}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-faint">
              {(r.leadName ? `${r.leadName} · ` : '') + (r.leadEmail || '')} · Email{' '}
              {r.seqNumber || '?'} · replied {fmtTime(r.replyTime)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close full screen"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-faint transition hover:bg-white/[0.04] hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* The reply itself, as a real rendered email */}
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-lime/80">
            <span className="h-1.5 w-1.5 rounded-full bg-lime/70" />
            Reply · {fmtTime(r.replyTime)} · from {r.leadEmail || '—'}
          </div>
          <SafeHtmlFrame html={r.replyHtml} text={r.replyText} className="min-h-0 flex-1" />
        </div>
      </div>
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
  const [fullscreen, setFullscreen] = useState<InboxReply | null>(null)

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

  // (Re)load whenever the target changes; drop any open full-screen reader.
  useEffect(() => {
    if (!query) return
    setFullscreen(null)
    void load(query, 0)
  }, [query, load])

  // Esc to close + lock body scroll while open. When the full-screen reader is
  // open it owns Esc (closes itself first), so the drawer ignores it.
  useEffect(() => {
    if (!query) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !fullscreen) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [query, onClose, fullscreen])

  if (!query) return null

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel — wide enough to read a run of replies without constant scrolling. */}
      <aside className="relative flex h-full w-full max-w-[1100px] flex-col border-l border-line bg-panel shadow-panel animate-rise [animation-duration:0.35s] lg:w-[85vw]">
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
            replies.map((r) => (
              <ReplyCard key={r.id} r={r} onFullscreen={() => setFullscreen(r)} />
            ))}

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

      {fullscreen && (
        <ReplyFullScreen r={fullscreen} onClose={() => setFullscreen(null)} />
      )}
    </div>
    </Portal>
  )
}
