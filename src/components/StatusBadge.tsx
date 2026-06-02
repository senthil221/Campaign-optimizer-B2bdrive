import type { CampaignStatus } from '../types'

const META: Record<CampaignStatus, { label: string; className: string }> = {
  critical: {
    label: 'Critical',
    className: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  upload_soon: {
    label: 'Upload soon',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
  unmapped: {
    label: 'Unmapped',
    className: 'bg-slate-100 text-slate-500 ring-slate-400/30',
  },
  no_capacity: {
    label: 'No capacity',
    className: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  },
  healthy: {
    label: 'Healthy',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  ended: {
    label: 'Ended',
    className: 'bg-slate-100 text-slate-400 ring-slate-300/40',
  },
}

export default function StatusBadge({ status }: { status: CampaignStatus }) {
  const meta = META[status]
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  )
}
