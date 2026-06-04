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
    <header className="sticky top-0 z-30 border-b border-line bg-base/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3 lg:px-10">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-lime/10 ring-1 ring-lime/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="13" width="4" height="8" rx="1.2" fill="#C6F24E" opacity="0.45" />
              <rect x="10" y="8" width="4" height="13" rx="1.2" fill="#C6F24E" opacity="0.75" />
              <rect x="17" y="3" width="4" height="18" rx="1.2" fill="#C6F24E" />
            </svg>
          </div>
          <h1 className="font-display text-[17px] font-semibold leading-none tracking-[-0.02em] text-ink">
            Campaign Optimizer
          </h1>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Emails-per-lead setting */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 transition hover:border-line/60 hover:bg-white/[0.03]">
            <span className="text-[10px] font-medium text-faint">Emails / lead</span>
            <input
              type="number"
              min={1}
              value={emailsPerLead}
              onChange={(e) =>
                onEmailsPerLeadChange(Math.max(1, Number(e.target.value) || 1))
              }
              className="tnum w-8 bg-transparent text-center text-[13px] font-semibold text-ink outline-none"
            />
          </label>

          {/* Live indicator */}
          <div className="hidden items-center gap-2 sm:flex">
            <span
              className={`relative flex h-2 w-2 ${loading ? '' : 'shadow-[0_0_6px_rgba(91,217,138,0.7)]'}`}
            >
              {!loading && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-50" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  loading ? 'animate-pulse bg-warn' : 'bg-positive'
                }`}
              />
            </span>
            <div className="leading-none">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">
                {loading ? 'Syncing' : 'Live'}
              </div>
              <div className="tnum mt-0.5 text-[11px] text-muted/70">
                {formatTime(lastUpdated)}
              </div>
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2 text-[13px] font-bold text-base shadow-glow transition hover:bg-lime-dim active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`text-[14px] leading-none ${loading ? 'animate-spin' : ''}`}>
              ↻
            </span>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  )
}
