interface Props {
  loading: boolean
  lastUpdated: Date | null
  emailsPerLead: number
  onEmailsPerLeadChange: (v: number) => void
  onRefresh: () => void
}

function formatTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Header({
  loading,
  lastUpdated,
  emailsPerLead,
  onEmailsPerLeadChange,
  onRefresh,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-3 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-lime/12 ring-1 ring-lime/25">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="13" width="4" height="8" rx="1.2" fill="#C6F24E" opacity="0.55" />
              <rect x="10" y="8" width="4" height="13" rx="1.2" fill="#C6F24E" opacity="0.8" />
              <rect x="17" y="3" width="4" height="18" rx="1.2" fill="#C6F24E" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-[18px] font-semibold leading-none tracking-[-0.01em] text-ink">
              Campaign Optimizer
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <label className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            Emails / lead
            <input
              type="number"
              min={1}
              value={emailsPerLead}
              onChange={(e) =>
                onEmailsPerLeadChange(Math.max(1, Number(e.target.value) || 1))
              }
              className="tnum w-11 rounded-lg border border-line bg-base px-2 py-1 text-center text-sm font-semibold text-ink outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/25"
            />
          </label>

          <div className="hidden items-center gap-2 text-right sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${
                loading
                  ? 'animate-pulse bg-warn'
                  : 'bg-positive shadow-[0_0_7px_rgba(91,217,138,0.6)]'
              }`}
            />
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
                {loading ? 'Syncing' : 'Live'}
              </div>
              <div className="tnum text-[12px] font-medium text-muted">
                {formatTime(lastUpdated)}
              </div>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-base shadow-glow transition hover:bg-lime-dim disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`text-base leading-none ${loading ? 'animate-spin' : ''}`}>
              ↻
            </span>
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  )
}
