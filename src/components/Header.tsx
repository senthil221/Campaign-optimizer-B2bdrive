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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Campaign Lead Forecast
          </h1>
          <p className="text-xs text-slate-500">
            Forecast lead depletion using Smartlead lead stats and tag sending
            volume.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Emails / lead
            <input
              type="number"
              min={1}
              value={emailsPerLead}
              onChange={(e) =>
                onEmailsPerLeadChange(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <div className="hidden text-right sm:block">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              Last updated
            </div>
            <div className="text-xs font-medium text-slate-600">
              {formatTime(lastUpdated)}
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className={`text-base leading-none ${loading ? 'animate-spin' : ''}`}
            >
              ↻
            </span>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  )
}
