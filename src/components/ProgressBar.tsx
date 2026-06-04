import type { CampaignLeadStats } from '../types'

// Thin completion bar. Color shifts with progress so a glance tells you how far
// a campaign has run: lime (done) → positive → warn → faint (barely started).
export function ProgressBar({
  percent,
  className = '',
}: {
  percent: number
  className?: string
}) {
  const p = Math.max(0, Math.min(100, percent))
  const color =
    p >= 100
      ? 'bg-lime'
      : p >= 66
        ? 'bg-positive'
        : p >= 33
          ? 'bg-warn'
          : 'bg-lime/45'
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${color}`}
        style={{ width: `${p}%` }}
      />
    </div>
  )
}

const fmt = (n: number) => n.toLocaleString()

// Multi-line hover summary mirroring Smartlead's lead breakdown popover.
export function leadBreakdownTitle(s: CampaignLeadStats): string {
  const pending = s.total > 0 ? ((s.total - s.completed) / s.total) * 100 : 0
  return [
    `${pending.toFixed(2)}% of campaign is pending`,
    `Total leads: ${fmt(s.total)}`,
    `Not started: ${fmt(s.notStarted)}`,
    `In progress: ${fmt(s.inprogress)}`,
    `Completed: ${fmt(s.completed)}`,
    `Blocked: ${fmt(s.blocked)}`,
  ].join('\n')
}
