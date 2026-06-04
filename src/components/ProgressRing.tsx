// Compact donut showing how far a campaign has run, with the % in the center.
// Color shifts with progress (faint → amber → green → lime) so a glance reads.
export function ProgressRing({
  percent,
  size = 34,
  stroke = 4,
}: {
  percent: number
  size?: number
  stroke?: number
}) {
  const p = Math.max(0, Math.min(100, percent))
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (p / 100) * circ
  const color =
    p >= 100 ? '#C6F24E' : p >= 66 ? '#5BD98A' : p >= 33 ? '#F4BD50' : '#acd93f'
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-label={`${Math.round(p)}% complete`}
    >
      <g transform={`rotate(-90 ${center} ${center})`}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </g>
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink font-semibold tabular-nums"
        style={{ fontSize: size * 0.28 }}
      >
        {Math.round(p)}%
      </text>
    </svg>
  )
}
