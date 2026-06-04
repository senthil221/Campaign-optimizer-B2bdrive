// Visual badge for a campaign's live Smartlead status (ACTIVE, PAUSED, …).
// Unknown / empty statuses fall back to a neutral pill so the column never
// renders blank.

interface Meta {
  label: string
  dot: string
  text: string
  ring: string
}

const META: Record<string, Meta> = {
  ACTIVE: {
    label: 'Active',
    dot: 'bg-positive shadow-[0_0_8px_rgba(91,217,138,0.6)]',
    text: 'text-positive',
    ring: 'ring-positive/25 bg-positive/10',
  },
  PAUSED: {
    label: 'Paused',
    dot: 'bg-warn shadow-[0_0_8px_rgba(244,189,80,0.7)]',
    text: 'text-warn',
    ring: 'ring-warn/25 bg-warn/10',
  },
  COMPLETED: {
    label: 'Completed',
    dot: 'bg-lime shadow-[0_0_8px_rgba(198,242,78,0.5)]',
    text: 'text-lime',
    ring: 'ring-lime/25 bg-lime/10',
  },
  DRAFTED: {
    label: 'Drafted',
    dot: 'bg-faint',
    text: 'text-muted',
    ring: 'ring-line bg-white/[0.03]',
  },
  STOPPED: {
    label: 'Stopped',
    dot: 'bg-critical shadow-[0_0_8px_rgba(251,110,114,0.7)]',
    text: 'text-critical',
    ring: 'ring-critical/25 bg-critical/10',
  },
}

const NEUTRAL: Meta = {
  label: 'Unknown',
  dot: 'bg-faint',
  text: 'text-faint',
  ring: 'ring-line bg-white/[0.02]',
}

export default function CampaignStatusBadge({ status }: { status: string }) {
  const key = (status || '').toUpperCase()
  const m = META[key] ?? {
    ...NEUTRAL,
    label: key ? key.charAt(0) + key.slice(1).toLowerCase() : NEUTRAL.label,
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${m.ring} ${m.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}
