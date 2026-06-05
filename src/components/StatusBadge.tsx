import type { CampaignStatus } from '../types'

const META: Record<
  CampaignStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  critical: {
    label: 'Critical',
    dot: 'bg-critical',
    text: 'text-critical',
    bg: 'bg-critical/[0.08] ring-1 ring-inset ring-critical/20',
  },
  upload_soon: {
    label: 'Upload soon',
    dot: 'bg-warn',
    text: 'text-warn',
    bg: 'bg-warn/[0.08] ring-1 ring-inset ring-warn/20',
  },
  unmapped: {
    label: 'Unmapped',
    dot: 'bg-faint/50',
    text: 'text-faint',
    bg: 'bg-white/[0.03] ring-1 ring-inset ring-white/8',
  },
  no_capacity: {
    label: 'No capacity',
    dot: 'bg-orange-400',
    text: 'text-orange-300',
    bg: 'bg-orange-400/[0.08] ring-1 ring-inset ring-orange-400/20',
  },
  healthy: {
    label: 'Healthy',
    dot: 'bg-positive',
    text: 'text-positive',
    bg: 'bg-positive/[0.08] ring-1 ring-inset ring-positive/20',
  },
  ended: {
    label: 'Ended',
    dot: 'bg-critical',
    text: 'text-critical',
    bg: 'bg-critical/[0.08] ring-1 ring-inset ring-critical/20',
  },
}

export default function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${m.bg} ${m.text}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}
