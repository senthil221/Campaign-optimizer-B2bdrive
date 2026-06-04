import type { CampaignTagMap } from '../types'

const TAG_MAP_KEY = 'sl_campaign_tag_map'
const EMAILS_PER_LEAD_KEY = 'sl_emails_per_lead'
const VISIBLE_COLUMNS_KEY = 'sl_visible_columns'

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

/** Persisted show/hide state for the performance table columns (id -> visible). */
export function loadVisibleColumns(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(VISIBLE_COLUMNS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, boolean>)
      : {}
  } catch {
    return {}
  }
}

export function saveVisibleColumns(value: Record<string, boolean>): void {
  try {
    localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
