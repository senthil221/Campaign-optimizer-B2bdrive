import type { Campaign } from '../types'

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
// When overview counters are present they're shown first, since the live
// lead-stats totals shrink once completed leads are deleted.
export function leadBreakdownTitle(c: Campaign): string {
  const s = c.leadStats
  const ov = c.overview
  const lines: string[] = []

  if (ov && ov.uniqueSent + ov.toBeStarted > 0) {
    const everEntered = ov.uniqueSent + ov.toBeStarted
    const finished = Math.max(0, ov.uniqueSent - ov.inProgress)
    const pending = everEntered > 0 ? ((everEntered - finished) / everEntered) * 100 : 0
    lines.push(
      `${pending.toFixed(2)}% of campaign is pending`,
      `Leads ever contacted: ${fmt(ov.uniqueSent)}`,
      `Still in progress: ${fmt(ov.inProgress)}`,
      `Yet to start: ${fmt(ov.toBeStarted)}`,
      `Current leads (after deletions): ${fmt(ov.totalLeads)}`,
    )
    return lines.join('\n')
  }

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
