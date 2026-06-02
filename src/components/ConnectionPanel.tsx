interface Props {
  jwt: string
  emailsPerLead: number
  manualIds: string
  loadingAccounts: boolean
  loadingCampaigns: boolean
  accountCount: number
  campaignCount: number
  error: string | null
  warnings: string[]
  onJwtChange: (v: string) => void
  onEmailsPerLeadChange: (v: number) => void
  onManualIdsChange: (v: string) => void
  onFetchAccounts: () => void
  onFetchCampaigns: () => void
}

export default function ConnectionPanel(props: Props) {
  const {
    jwt,
    emailsPerLead,
    manualIds,
    loadingAccounts,
    loadingCampaigns,
    accountCount,
    campaignCount,
    error,
    warnings,
    onJwtChange,
    onEmailsPerLeadChange,
    onManualIdsChange,
    onFetchAccounts,
    onFetchCampaigns,
  } = props

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Connection</h2>
        <div className="flex gap-3 text-xs text-slate-400">
          <span>{accountCount} accounts</span>
          <span>{campaignCount} campaigns</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-7">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            JWT (Bearer token)
          </label>
          <input
            type="password"
            value={jwt}
            onChange={(e) => onJwtChange(e.target.value)}
            placeholder="eyJhbGciOiJ..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Campaign IDs (optional)
          </label>
          <input
            type="text"
            value={manualIds}
            onChange={(e) => onManualIdsChange(e.target.value)}
            placeholder="3434132, 3433660 …"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Emails / lead
          </label>
          <input
            type="number"
            min={1}
            value={emailsPerLead}
            onChange={(e) =>
              onEmailsPerLeadChange(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        Campaign IDs are optional — leave blank to auto-discover them from your
        Smartlead campaign list. Provide them to fetch analytics for specific
        campaigns only.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onFetchAccounts}
          disabled={loadingAccounts || !jwt}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingAccounts ? 'Fetching accounts…' : 'Fetch accounts / tags'}
        </button>
        <button
          onClick={onFetchCampaigns}
          disabled={loadingCampaigns || !jwt}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingCampaigns ? 'Fetching campaigns…' : 'Fetch campaigns'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <div className="mb-1 font-semibold">Error</div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
            {error}
          </pre>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="mb-1 font-semibold">Warnings</div>
          <ul className="list-inside list-disc space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="break-words">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
