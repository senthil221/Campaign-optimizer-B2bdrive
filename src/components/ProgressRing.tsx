// Donut ring showing campaign completion %. Color shifts: lime-dim → amber → green → lime.
// Sized up to 40px default for better in-table legibility.
export function ProgressRing({
  percent,
  size = 34,
  stroke = 3,
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
    p >= 100
      ? 'rgb(var(--color-lime))'
      : p >= 66
        ? 'rgb(var(--color-positive))'
        : p >= 33
          ? 'rgb(var(--color-warn))'
          : 'rgb(var(--color-lime-dim))'
  const center = size / 2
  const glowId = `ring-glow-${Math.round(p)}`

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-label={`${Math.round(p)}% complete`}
    >
      <defs>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`rotate(-90 ${center} ${center})`}>
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgb(var(--color-line))"
          strokeWidth={stroke}
        />
        {/* Fill arc */}
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
          filter={`url(#${glowId})`}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </g>
      {/* Center label */}
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgb(var(--color-ink))"
        fontWeight="700"
        style={{
          fontSize: size * 0.23,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum" 1',
        }}
      >
        {Math.round(p)}%
      </text>
    </svg>
  )
}
