interface Props {
  totalCampaigns: number
  totalTags: number
  totalDailyVolume: number
  uploadSoon: number
  critical: number
}

function Card({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'warning' | 'danger'
}) {
  const valueTone =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </div>
    </div>
  )
}

export default function SummaryCards({
  totalCampaigns,
  totalTags,
  totalDailyVolume,
  uploadSoon,
  critical,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Card label="Total campaigns" value={totalCampaigns.toLocaleString()} />
      <Card label="Total tags" value={totalTags.toLocaleString()} />
      <Card
        label="Total daily volume"
        value={totalDailyVolume.toLocaleString()}
      />
      <Card label="Upload soon" value={uploadSoon} tone="warning" />
      <Card label="Critical" value={critical} tone="danger" />
    </div>
  )
}
