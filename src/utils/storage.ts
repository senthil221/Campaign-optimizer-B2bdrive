import type { CampaignTagMap } from '../types'

const TAG_MAP_KEY = 'sl_campaign_tag_map'
const EMAILS_PER_LEAD_KEY = 'sl_emails_per_lead'

// One key per table whose columns can be shown/hidden.
export const PERF_COLUMNS_KEY = 'sl_visible_columns'
export const TAG_COLUMNS_KEY = 'sl_tag_columns'

export const DEFAULT_EMAILS_PER_LEAD = 2

export function loadTagMap(): CampaignTagMap {
  try {
    const raw = localStorage.getItem(TAG_MAP_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as CampaignTagMap) : {}
  } catch {
    return {}
  }
}

export function saveTagMap(map: CampaignTagMap): void {
  try {
    localStorage.setItem(TAG_MAP_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function loadEmailsPerLead(): number {
  const v = Number(localStorage.getItem(EMAILS_PER_LEAD_KEY))
  return Number.isFinite(v) && v >= 1 ? v : DEFAULT_EMAILS_PER_LEAD
}

export function saveEmailsPerLead(value: number): void {
  try {
    localStorage.setItem(EMAILS_PER_LEAD_KEY, String(value))
  } catch {
    /* ignore */
  }
}

/** Persisted show/hide state for a table's columns (id -> visible). */
export function loadVisibleColumns(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, boolean>)
      : {}
  } catch {
    return {}
  }
}

export function saveVisibleColumns(
  key: string,
  value: Record<string, boolean>,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
