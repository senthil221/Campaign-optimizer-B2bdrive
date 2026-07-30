export type AppPage = 'campaigns' | 'domains'

interface Props {
  loading: boolean
  lastUpdated: Date | null
  emailsPerLead: number
  onEmailsPerLeadChange: (v: number) => void
  onRefresh: () => void
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  activePage: AppPage
  onPageChange: (page: AppPage) => void
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
  theme,
  onThemeChange,
  activePage,
  onPageChange,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3 lg:px-10">
        <div className="flex min-w-0 items-center gap-4 lg:gap-6">
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-lime/10 text-lime ring-1 ring-lime/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="13" width="4" height="8" rx="1.2" fill="currentColor" opacity="0.45" />
                <rect x="10" y="8" width="4" height="13" rx="1.2" fill="currentColor" opacity="0.75" />
                <rect x="17" y="3" width="4" height="18" rx="1.2" fill="currentColor" />
              </svg>
            </div>
            <h1 className="hidden font-display text-[17px] font-semibold leading-none tracking-[-0.02em] text-ink sm:block">
              Campaign Optimizer
            </h1>
          </div>

          {/* Page navigation */}
          <nav className="flex items-center rounded-lg border border-line bg-panel-2/70 p-0.5">
            {([
              ['campaigns', 'Campaigns'],
              ['domains', 'Domain health'],
            ] as const).map(([page, label]) => (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  activePage === page
                    ? 'bg-panel text-ink shadow-sm ring-1 ring-inset ring-line'
                    : 'text-muted hover:text-ink'
                }`}
                aria-current={activePage === page ? 'page' : undefined}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-line/60 hover:bg-white/[0.04] hover:text-ink"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {/* Emails-per-lead setting */}
          {activePage === 'campaigns' && (
            <label className="hidden cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 transition hover:border-line/60 hover:bg-white/[0.03] md:flex">
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
          )}

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
            className="inline-flex items-center gap-2 rounded-xl bg-lime-fill px-4 py-2 text-[13px] font-bold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
