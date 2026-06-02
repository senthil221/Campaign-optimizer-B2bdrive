import type { AlertLevel } from '../types'

const STYLES: Record<AlertLevel, { label: string; className: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  },
  upload_soon: {
    label: 'Upload soon',
    className: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  },
  critical: {
    label: 'Critical',
    className: 'bg-red-100 text-red-800 ring-red-600/20',
  },
  ended: {
    label: 'Ended',
    className: 'bg-rose-200 text-rose-900 ring-rose-700/30',
  },
  no_capacity: {
    label: 'No capacity',
    className: 'bg-slate-200 text-slate-700 ring-slate-500/20',
  },
}

export default function AlertBadge({ level }: { level: AlertLevel }) {
  const { label, className } = STYLES[level]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  )
}
