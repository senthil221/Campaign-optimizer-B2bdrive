import type { CampaignStatus } from '../types'

const META: Record<
  CampaignStatus,
  { label: string; dot: string; text: string; ring: string }
> = {
  critical: {
    label: 'Critical',
    dot: 'bg-critical shadow-[0_0_8px_rgba(251,110,114,0.8)]',
    text: 'text-critical',
    ring: 'ring-critical/25 bg-critical/10',
  },
  upload_soon: {
    label: 'Upload soon',
    dot: 'bg-warn shadow-[0_0_8px_rgba(244,189,80,0.7)]',
    text: 'text-warn',
    ring: 'ring-warn/25 bg-warn/10',
  },
  unmapped: {
    label: 'Unmapped',
    dot: 'bg-faint',
    text: 'text-muted',
    ring: 'ring-line bg-white/[0.03]',
  },
  no_capacity: {
    label: 'No capacity',
    dot: 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]',
    text: 'text-orange-300',
    ring: 'ring-orange-400/25 bg-orange-400/10',
  },
  healthy: {
    label: 'Healthy',
    dot: 'bg-positive shadow-[0_0_8px_rgba(91,217,138,0.6)]',
    text: 'text-positive',
    ring: 'ring-positive/25 bg-positive/10',
  },
  ended: {
    label: 'Ended',
    dot: 'bg-faint',
    text: 'text-faint',
    ring: 'ring-line bg-white/[0.02]',
  },
}

export default function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${m.ring} ${m.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}
