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
  suffix,
}: {
  label: string
  value: number
  tone?: Tone
  loading?: boolean
  suffix?: string
}) {
  const numColor =
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

  const accentBar =
    tone === 'critical' && value > 0
      ? 'after:bg-critical'
      : tone === 'warn' && value > 0
        ? 'after:bg-warn'
        : tone === 'lime'
          ? 'after:bg-lime'
          : 'after:bg-transparent'

  return (
    <div
      className={`group relative flex flex-1 flex-col justify-center gap-1.5 px-6 py-5 transition-colors hover:bg-white/[0.02]
        after:absolute after:bottom-0 after:left-6 after:h-[2px] after:w-8 after:rounded-full after:opacity-0 after:transition-opacity after:duration-300 group-hover:after:opacity-100 ${accentBar}`}
    >
      <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.18em] text-muted/80">
        {label}
      </span>
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded-md bg-white/5" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span
            className={`tnum font-display text-[28px] font-bold leading-none tracking-[-0.03em] ${numColor}`}
          >
            {value.toLocaleString()}
          </span>
          {suffix && (
            <span className="text-[11px] font-medium text-faint">{suffix}</span>
          )}
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
    <div className="flex items-stretch divide-x divide-line overflow-hidden overflow-x-auto rounded-2xl border border-line bg-panel shadow-panel">
      <Stat label="Campaigns" value={totalCampaigns} loading={loading} />
      <Stat label="Untagged" value={unmapped} loading={loading} />
      <Stat label="Critical" value={critical} tone="critical" loading={loading} />
      <Stat label="Upload soon" value={uploadSoon} tone="warn" loading={loading} />
      <Stat
        label="Daily volume"
        value={totalDailyVolume}
        tone="lime"
        suffix="/ day"
        loading={loading}
      />
    </div>
  )
}
