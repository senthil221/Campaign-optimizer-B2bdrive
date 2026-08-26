// Campaigns are filtered by their own creation date, compared in IST so the
// buckets line up with the rest of the dashboard's reporting day.

const IST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export type DateRange = 'lifetime' | 'today' | '3d'

/** Lifetime is the default and never filters. */
export const DATE_RANGES = [
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'today', label: 'Today' },
  { id: '3d', label: '3D' },
] as const

/** IST calendar day for an instant, as YYYY-MM-DD. */
export function istDate(value: Date): string {
  return IST_DATE_FORMAT.format(value)
}

export function istDaysAgo(days: number, now = new Date()): string {
  return istDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
}

/**
 * Whether a campaign's creation date falls in the selected range. 3D covers
 * today plus the two days before it, matching the Domain Management quick
 * ranges. A campaign whose creation date Smartlead did not report cannot be
 * placed on a day, so it only ever appears under Lifetime.
 */
export function withinRange(
  createdAt: string | null,
  range: DateRange,
  now = new Date(),
): boolean {
  if (range === 'lifetime') return true
  if (!createdAt) return false
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return false
  const day = istDate(parsed)
  return range === 'today'
    ? day === istDaysAgo(0, now)
    : day >= istDaysAgo(2, now)
}

/** "2026-08-27T09:12:00Z" -> "27 Aug 2026" in IST. Em dash when unreported. */
export function formatCreated(iso: string | null): string {
  if (!iso) return '\u2014'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return '\u2014'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(parsed)
}
