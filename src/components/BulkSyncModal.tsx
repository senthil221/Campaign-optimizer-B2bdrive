import { useEffect, useMemo } from 'react'
import type { BulkSyncPreview, BulkSyncResult } from '../types'
import type { BulkSyncSelection } from '../utils/bulkSync'

interface Props {
  selection: BulkSyncSelection
  previews: BulkSyncPreview[] | null
  results: BulkSyncResult[] | null
  loading: boolean
  executing: boolean
  error: string | null
  onPreview: () => void
  onConfirm: () => void
  onClose: () => void
}

function count(value: number): string {
  return value.toLocaleString()
}

export default function BulkSyncModal({
  selection,
  previews,
  results,
  loading,
  executing,
  error,
  onPreview,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !executing) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [executing, onClose])

  const changed = useMemo(
    () =>
      (previews ?? []).filter(
        (row) => !row.error && (row.toAddCount > 0 || row.toRemoveCount > 0),
      ),
    [previews],
  )
  const unchanged = (previews ?? []).filter(
    (row) => !row.error && row.toAddCount === 0 && row.toRemoveCount === 0,
  ).length
  const previewErrors = (previews ?? []).filter((row) => row.error).length
  const skippedTotal =
    selection.skipped.noMatchingTag +
    selection.skipped.ambiguousTag +
    selection.skipped.emptyPool

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !executing && onClose()}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-sync-title"
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-panel"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lime/80">
              <span className="h-[14px] w-[3px] rounded-full bg-lime" />
              Automatic sender assignment
            </div>
            <h2
              id="bulk-sync-title"
              className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-ink"
            >
              Bulk Sync
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              Exact-match campaign tags to email-account tags, then make each
              campaign&apos;s sender list match its connected tag pool.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={executing}
            aria-label="Close Bulk Sync"
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint transition hover:bg-white/[0.04] hover:text-ink disabled:opacity-40"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="All campaigns" value={selection.totalCampaigns} />
            <Stat label="Exact matches" value={selection.plan.campaigns.length} tone="lime" />
            <Stat label="Need changes" value={changed.length} tone={changed.length ? 'warn' : 'default'} />
            <Stat label="Skipped safely" value={skippedTotal} />
          </div>

          {skippedTotal > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-line bg-panel-2/50 px-4 py-3 text-[11px] text-muted">
              <span>No matching email tag: <b className="text-ink">{selection.skipped.noMatchingTag}</b></span>
              <span>Multiple matching tags: <b className="text-ink">{selection.skipped.ambiguousTag}</b></span>
              <span>No connected accounts: <b className="text-ink">{selection.skipped.emptyPool}</b></span>
            </div>
          )}

          {(loading || executing) && (
            <div className="flex items-center gap-3 rounded-xl border border-lime/20 bg-lime/[0.05] px-4 py-3 text-sm text-lime">
              <span className="inline-block animate-spin">↻</span>
              {loading
                ? `Comparing ${selection.plan.campaigns.length} campaign sender lists…`
                : `Syncing ${changed.length} changed campaigns…`}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
              <div className="font-semibold">Bulk Sync couldn&apos;t continue.</div>
              <div className="mt-1 break-words text-critical/80">{error}</div>
            </div>
          )}

          {!loading &&
            !error &&
            previews &&
            selection.plan.campaigns.length > 0 &&
            !results && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted">
                  {changed.length > 0
                    ? `${changed.length} campaign${changed.length === 1 ? '' : 's'} differ · ${unchanged} already synced${previewErrors ? ` · ${previewErrors} failed to compare` : ''}`
                    : `No sender differences found · ${unchanged} already synced${previewErrors ? ` · ${previewErrors} failed to compare` : ''}`}
                </div>
                {changed.some((row) => row.toRemoveCount > 0) && (
                  <div className="rounded-full border border-warn/30 bg-warn/[0.08] px-3 py-1 text-[10px] font-semibold text-warn">
                    Exact sync will remove non-matching senders
                  </div>
                )}
              </div>
              <PreviewTable rows={previews} />
            </>
          )}

          {!loading && results && <ResultsTable rows={results} />}

          {!loading && !error && selection.plan.campaigns.length === 0 && (
            <div className="grid place-items-center rounded-xl border border-line bg-panel-2/30 px-4 py-12 text-center">
              <div className="text-sm font-semibold text-ink">No campaigns are eligible</div>
              <div className="mt-1 max-w-md text-xs text-muted">
                Campaigns need exactly one campaign tag that matches an email-account tag with connected accounts.
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <div className="text-[10px] text-faint">
            Smartlead is re-checked immediately before every write.
          </div>
          <div className="flex items-center gap-2">
            {error && selection.plan.campaigns.length > 0 && (
              <button
                type="button"
                onClick={onPreview}
                disabled={loading || executing}
                className="rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
              >
                Retry preview
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={executing}
              className="rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
            >
              {results ? 'Done' : 'Cancel'}
            </button>
            {!results &&
              previews &&
              !error &&
              selection.plan.campaigns.length > 0 && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={changed.length === 0 || executing || previewErrors > 0}
                className="rounded-lg bg-lime-fill px-4 py-2 text-xs font-bold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover disabled:cursor-not-allowed disabled:opacity-40"
                title={previewErrors > 0 ? 'Resolve preview errors before syncing' : undefined}
              >
                Sync {changed.length} campaign{changed.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'lime' | 'warn'
}) {
  const color = tone === 'lime' ? 'text-lime' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="rounded-xl border border-line bg-panel-2/40 px-3.5 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={`tnum mt-1 text-xl font-semibold ${color}`}>{count(value)}</div>
    </div>
  )
}

function PreviewTable({ rows }: { rows: BulkSyncPreview[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-elevated text-[9px] uppercase tracking-[0.12em] text-faint">
            <tr>
              <th className="px-3 py-2.5">Campaign</th>
              <th className="px-3 py-2.5">Matched tag</th>
              <th className="px-3 py-2.5 text-right">Current</th>
              <th className="px-3 py-2.5 text-right">Desired</th>
              <th className="px-3 py-2.5 text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((row) => (
              <tr key={row.campaignId} className="bg-panel-2/20">
                <td className="max-w-[280px] truncate px-3 py-2.5 font-medium text-ink" title={row.campaignName}>
                  {row.campaignName}
                </td>
                <td className="px-3 py-2.5 text-muted">{row.tagName}</td>
                <td className="tnum px-3 py-2.5 text-right text-muted">{row.error ? '—' : count(row.currentCount)}</td>
                <td className="tnum px-3 py-2.5 text-right text-muted">{count(row.desiredCount)}</td>
                <td className="tnum px-3 py-2.5 text-right">
                  {row.error ? (
                    <span className="text-critical" title={row.error}>Compare failed</span>
                  ) : row.toAddCount === 0 && row.toRemoveCount === 0 ? (
                    <span className="text-positive">Synced</span>
                  ) : (
                    <span className="space-x-2">
                      {row.toAddCount > 0 && <span className="text-positive">+{count(row.toAddCount)}</span>}
                      {row.toRemoveCount > 0 && <span className="text-warn">−{count(row.toRemoveCount)}</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResultsTable({ rows }: { rows: BulkSyncResult[] }) {
  const synced = rows.filter((row) => row.status === 'synced').length
  const unchanged = rows.filter((row) => row.status === 'unchanged').length
  const failed = rows.filter((row) => row.status === 'error').length
  return (
    <div className="space-y-3">
      <div className={`rounded-xl border px-4 py-3 text-sm ${failed ? 'border-warn/30 bg-warn/[0.08] text-warn' : 'border-positive/30 bg-positive/[0.08] text-positive'}`}>
        <span className="font-semibold">Bulk Sync finished.</span>{' '}
        {synced} changed · {unchanged} already synced · {failed} failed
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="max-h-[360px] overflow-auto divide-y divide-line-soft">
          {rows.map((row) => (
            <div key={row.campaignId} className="flex items-start justify-between gap-4 bg-panel-2/20 px-3.5 py-2.5 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{row.campaignName}</div>
                <div className="mt-0.5 text-[10px] text-faint">{row.tagName}{row.error ? ` · ${row.error}` : ''}</div>
              </div>
              <div className={`shrink-0 font-semibold ${row.status === 'error' ? 'text-critical' : row.status === 'synced' ? 'text-positive' : 'text-muted'}`}>
                {row.status === 'error'
                  ? 'Failed'
                  : row.status === 'unchanged'
                    ? 'Already synced'
                    : `+${row.added} / −${row.removed}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
