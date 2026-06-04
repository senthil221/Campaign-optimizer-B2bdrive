import type { CampaignStatus, TagForecast } from '../types'
import StatusBadge from './StatusBadge'
import ColumnsMenu from './ColumnsMenu'

const fmt = (n: number) => n.toLocaleString()
const daysFmt = (d: number | null) => (d === null ? '—' : String(d))

const TH = 'px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint/60 whitespace-nowrap align-middle'
const TD = 'px-3 py-2 whitespace-nowrap align-middle tnum tabular-nums text-[13px]'

// Toggleable columns (the Tag name column is always shown).
export const TAG_COLUMNS = [
  { id: 'leads', label: 'Leads' },
  { id: 'notStarted', label: 'Not started' },
  { id: 'demand', label: 'Demand' },
  { id: 'daysLeft', label: 'Days left' },
  { id: 'status', label: 'Status' },
  { id: 'accts', label: 'Accts' },
  { id: 'volume', label: 'Volume' },
  { id: 'used', label: 'Used today' },
  { id: 'unused', label: 'Idle inboxes' },
  { id: 'avgRep', label: 'Avg rep' },
  { id: 'disc', label: 'Disc.' },
] as const

type TagColumnId = (typeof TAG_COLUMNS)[number]['id']

// Left accent border on the first cell (avoids positioning the <tr>, which
// shifts table columns in Chrome).
const RAIL: Record<CampaignStatus, string> = {
  critical: 'border-l-critical',
  upload_soon: 'border-l-warn',
  no_capacity: 'border-l-orange-400',
  healthy: 'border-l-positive/45',
  unmapped: 'border-l-transparent',
  ended: 'border-l-transparent',
}

const daysColor = (d: number | null, status: CampaignStatus) => {
  if (d === null) return 'text-faint'
  if (status === 'critical') return 'text-critical'
  if (status === 'upload_soon') return 'text-warn'
  return 'text-ink'
}

const repColor = (r: number) =>
  r === 0 ? 'text-faint' : r >= 90 ? 'text-positive' : r >= 75 ? 'text-warn' : 'text-critical'

export default function TagForecastSummary({
  tags,
  loading,
  visibleCols,
  onColumnsChange,
}: {
  tags: TagForecast[]
  loading: boolean
  visibleCols: Record<string, boolean>
  onColumnsChange: (next: Record<string, boolean>) => void
}) {
  const show = (id: TagColumnId) => visibleCols[id] !== false

  const rows = [...tags].sort((a, b) => {
    const da = a.sharedTagDaysLeft
    const db = b.sharedTagDaysLeft
    if (da === null && db === null) return b.totalDailyVolume - a.totalDailyVolume
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="h-[18px] w-[3px] rounded-full bg-gradient-to-b from-lime to-lime/30" />
          <h2 className="font-display text-[16px] font-semibold leading-none tracking-[-0.02em] text-ink">
            Tag Overview
          </h2>
          <span className="hidden text-[11px] text-faint/60 sm:block">sending health &amp; forecast</span>
        </div>
        <ColumnsMenu
          columns={TAG_COLUMNS}
          visibleCols={visibleCols}
          onColumnsChange={onColumnsChange}
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded-md bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-faint">
          No sending tags found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} pl-5 text-left`}>Tag</th>
                {show('leads') && (
                  <th className={`${TH} border-l border-line text-right`}>Leads</th>
                )}
                {show('notStarted') && <th className={`${TH} text-right`}>Not started</th>}
                {show('demand') && <th className={`${TH} text-right`}>Demand</th>}
                {show('daysLeft') && <th className={`${TH} text-right`}>Days left</th>}
                {show('status') && <th className={`${TH} pl-4 text-left`}>Status</th>}
                {show('accts') && (
                  <th className={`${TH} border-l border-line text-right`}>Accts</th>
                )}
                {show('volume') && <th className={`${TH} text-right`}>Volume</th>}
                {show('used') && <th className={`${TH} text-right`}>Used today</th>}
                {show('unused') && (
                  <th className={`${TH} text-right`} title="Inboxes tagged but not assigned to any campaign">
                    Idle inboxes
                  </th>
                )}
                {show('avgRep') && <th className={`${TH} text-right`}>Avg rep</th>}
                {show('disc') && <th className={`${TH} pr-5 text-right`}>Disc.</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const idle = t.mappedCampaigns === 0
                return (
                  <tr
                    key={t.tagName}
                    className="group border-b border-line-soft transition-colors last:border-0 hover:bg-white/[0.03]"
                  >
                    <td
                      className={`max-w-[200px] truncate border-l-[3px] px-3 py-1.5 pl-[17px] align-middle text-[13px] font-medium text-ink ${RAIL[t.status]}`}
                      title={`${t.tagName} · ${t.mappedCampaigns} campaign(s)`}
                    >
                      {t.tagName}
                    </td>
                    {show('leads') && (
                      <td className={`${TD} border-l border-line text-right text-ink`}>
                        {idle ? <span className="text-faint">—</span> : fmt(t.leadsTotal)}
                      </td>
                    )}
                    {show('notStarted') && (
                      <td className={`${TD} text-right font-semibold text-ink`}>
                        {idle ? <span className="font-normal text-faint">—</span> : fmt(t.notStartedTotal)}
                      </td>
                    )}
                    {show('demand') && (
                      <td className={`${TD} text-right text-muted`}>
                        {idle ? <span className="text-faint">—</span> : fmt(t.sharedTagDemand)}
                      </td>
                    )}
                    {show('daysLeft') && (
                      <td className={`${TD} text-right`}>
                        <span
                          className={`tnum font-display text-[19px] font-semibold leading-none tracking-[-0.01em] ${daysColor(
                            t.sharedTagDaysLeft,
                            t.status,
                          )}`}
                        >
                          {daysFmt(t.sharedTagDaysLeft)}
                        </span>
                      </td>
                    )}
                    {show('status') && (
                      <td className="px-3 py-1.5 pl-4 align-middle">
                        {idle ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-faint ring-1 ring-inset ring-line">
                            <span className="h-1.5 w-1.5 rounded-full bg-faint/60" />
                            Idle
                          </span>
                        ) : (
                          <StatusBadge status={t.status} />
                        )}
                      </td>
                    )}
                    {show('accts') && (
                      <td className={`${TD} border-l border-line text-right text-muted`}>
                        {t.accountCount}
                      </td>
                    )}
                    {show('volume') && (
                      <td className={`${TD} text-right font-semibold text-ink`}>
                        {fmt(t.totalDailyVolume)}
                      </td>
                    )}
                    {show('used') && (
                      <td className={`${TD} text-right text-muted`}>{fmt(t.usedToday)}</td>
                    )}
                    {show('unused') && (
                      <td
                        className={`${TD} text-right`}
                        title={
                          t.idleCount > 0
                            ? `${t.idleCount} inbox${t.idleCount > 1 ? 'es' : ''} tagged "${t.tagName}" but not in any campaign — ${fmt(t.idleVolume)} emails/day sitting idle`
                            : 'All inboxes are assigned to campaigns'
                        }
                      >
                        {t.idleCount > 0 ? (
                          <span className="text-warn">
                            {fmt(t.idleVolume)}
                            <span className="ml-1 text-[11px] text-warn/60">({t.idleCount})</span>
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    )}
                    {show('avgRep') && (
                      <td className={`${TD} text-right ${repColor(t.avgWarmupReputation)}`}>
                        {t.avgWarmupReputation || '—'}
                      </td>
                    )}
                    {show('disc') && (
                      <td
                        className={`${TD} pr-5 text-right ${
                          t.disconnects > 0 ? 'font-semibold text-critical' : 'text-faint'
                        }`}
                      >
                        {t.disconnects > 0 ? t.disconnects : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
