interface Props {
  jwt: string
  apiKey: string
  emailsPerLead: number
  loadingAccounts: boolean
  loadingCampaigns: boolean
  usingMock: boolean
  error: string | null
  onJwtChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onEmailsPerLeadChange: (v: number) => void
  onFetchAccounts: () => void
  onFetchCampaigns: () => void
  onLoadMock: () => void
}

export default function ConnectionPanel(props: Props) {
  const {
    jwt,
    apiKey,
    emailsPerLead,
    loadingAccounts,
    loadingCampaigns,
    usingMock,
    error,
    onJwtChange,
    onApiKeyChange,
    onEmailsPerLeadChange,
    onFetchAccounts,
    onFetchCampaigns,
    onLoadMock,
  } = props

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Connection</h2>
        {usingMock && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Showing mock data
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-6">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            JWT (Bearer token)
          </label>
          <input
            type="password"
            value={jwt}
            onChange={(e) => onJwtChange(e.target.value)}
            placeholder="eyJhbGciOiJ..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-4">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            API key (optional)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Smartlead API key"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onFetchAccounts}
          disabled={loadingAccounts}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAccounts ? 'Fetching accounts…' : 'Fetch accounts / tags'}
        </button>
        <button
          onClick={onFetchCampaigns}
          disabled={loadingCampaigns}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingCampaigns ? 'Fetching campaigns…' : 'Fetch campaigns'}
        </button>
        <button
          onClick={onLoadMock}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Load mock data
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </section>
  )
}
