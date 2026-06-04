interface Props {
  totalCampaigns: number
  unmapped: number
  critical: number
  uploadSoon: number
  totalDailyVolume: number
  loading?: boolean
}

type Tone = 'default' | 'lime' | 'critical' | 'warn'

function Stat({
  label,
  value,
  tone = 'default',
  loading,
}: {
  label: string
  value: number
  tone?: Tone
  loading?: boolean
}) {
  const color =
    tone === 'lime'
      ? 'text-lime'
      : tone === 'critical'
        ? value > 0
          ? 'text-critical'
          : 'text-faint'
        : tone === 'warn'
          ? value > 0
            ? 'text-warn'
            : 'text-faint'
          : 'text-ink'

  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 lg:px-6">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      {loading ? (
        <div className="h-9 w-16 animate-pulse rounded bg-white/5" />
      ) : (
        <span className={`tnum font-display text-4xl leading-none ${color}`}>
          {value.toLocaleString()}
        </span>
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
    <div className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel shadow-panel sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
      <Stat label="Campaigns" value={totalCampaigns} loading={loading} />
      <Stat label="Unmapped" value={unmapped} loading={loading} />
      <Stat label="Critical tags" value={critical} tone="critical" loading={loading} />
      <Stat label="Upload soon" value={uploadSoon} tone="warn" loading={loading} />
      <Stat
        label="Daily send volume"
        value={totalDailyVolume}
        tone="lime"
        loading={loading}
      />
    </div>
  )
}
