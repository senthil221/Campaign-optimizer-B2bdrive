import type { CampaignTagMap } from '../types'

const TAG_MAP_KEY = 'sl_campaign_tag_map'
const EMAILS_PER_LEAD_KEY = 'sl_emails_per_lead'

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
