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
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-lime/15 ring-1 ring-lime/30">
            <span className="font-display text-2xl leading-none text-lime">⌁</span>
          </div>
          <div>
            <h1 className="font-display text-[26px] leading-none tracking-tight text-ink">
              Lead Forecast
            </h1>
            <p className="mt-1 text-xs text-muted">
              Tag-level depletion &amp; campaign performance · Smartlead
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <label className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Emails / lead
            <input
              type="number"
              min={1}
              value={emailsPerLead}
              onChange={(e) =>
                onEmailsPerLeadChange(Math.max(1, Number(e.target.value) || 1))
              }
              className="tnum w-12 rounded-md border border-line bg-base px-2 py-1 text-center text-sm font-semibold text-lime outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/30"
            />
          </label>

          <div className="hidden items-center gap-2 text-right sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${
                loading
                  ? 'animate-pulse bg-warn shadow-[0_0_8px_rgba(244,189,80,0.8)]'
                  : 'bg-positive shadow-[0_0_8px_rgba(91,217,138,0.7)]'
              }`}
            />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-faint">
                {loading ? 'Syncing' : 'Live'}
              </div>
              <div className="tnum text-xs font-medium text-muted">
                {formatTime(lastUpdated)}
              </div>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-lime px-4 py-2.5 text-sm font-semibold text-base shadow-glow transition hover:bg-lime-dim disabled:cursor-not-allowed disabled:opacity-50"
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
