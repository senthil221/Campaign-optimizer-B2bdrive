interface Props {
  totalCampaigns: number
  unmapped: number
  critical: number
  uploadSoon: number
  totalDailyVolume: number
  loading?: boolean
}

function Card({
  label,
  value,
  tone = 'default',
  loading,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'danger' | 'warning' | 'neutral'
  loading?: boolean
}) {
  const valueTone =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : tone === 'neutral'
          ? 'text-slate-500'
          : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-14 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>
          {value}
        </div>
      )}
    </div>
  )
}

export default function SummaryCards({
  totalCampaigns,
  unmapped,
  critical,
  uploadSoon,
  totalDailyVolume,
  loading,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card label="Total campaigns" value={totalCampaigns.toLocaleString()} loading={loading} />
      <Card label="Unmapped" value={unmapped.toLocaleString()} tone="neutral" loading={loading} />
      <Card label="Critical" value={critical.toLocaleString()} tone="danger" loading={loading} />
      <Card label="Upload soon" value={uploadSoon.toLocaleString()} tone="warning" loading={loading} />
      <Card
        label="Total daily tag volume"
        value={totalDailyVolume.toLocaleString()}
        loading={loading}
      />
    </div>
  )
}
