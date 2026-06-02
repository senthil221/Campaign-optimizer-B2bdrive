# Smartlead Campaign Lead-Count Dashboard

A professional, dense dashboard (React + Vite + TypeScript + Tailwind) that uses **only real
Smartlead data** to tell you **when each campaign / tag runs out of leads**, so you can upload
more before it ends. No mock data, no fake fallbacks.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Enter your **JWT (Bearer token)**, then:
1. **Fetch accounts / tags** — pulls every in-use email account and builds tag sending volume.
2. **Fetch campaigns** — discovers campaign IDs + names, then pulls real lead-stat analytics.

## Data flow

### Email accounts / tags
`GET /api/email-account/get-total-email-accounts?offset={offset}&limit=100&isInUse=true`
- Bearer JWT, `limit=100`, paginated with `offset += 100` until a page returns nothing.
- Deduped by `id`, grouped by tag.

Per tag: `account_count`, `total_daily_volume = Σ message_per_day`,
`used_today = Σ daily_sent_count`, `remaining_today`, `avg_warmup_reputation`.

### Campaigns
1. **Campaign list** → `GET /api/email-campaigns` for campaign IDs + names + status (best-effort;
   if it fails you still get IDs and a warning that names are missing).
2. **Analytics** → `POST /api/email-campaigns/get-campaign-analytics`.
   - This endpoint **requires** a curly-brace ID string, e.g.
     `{ "campaign_ids": "{3434132,3433660,3432770}" }`. Empty body does **not** work.
   - IDs are chunked **50 per request**, results merged by `id`, then joined with names.
   - You can paste specific **Campaign IDs** in the connection panel to override discovery.

Normalized per campaign: `sent_count`, `reply_count`, `ooo_reply_count`, `bounce_count`,
`total_count`, `drafted_count`, and `campaign_lead_stats` (`total`, `completed`, `inprogress`,
`notStarted`, `paused`, `blocked`, `stopped`, `senderBounced`).

### Depletion math (emails_per_lead default = 2)
```
remaining_email_demand = notStarted * emails_per_lead
campaign_days_left     = ceil(remaining_email_demand / mapped_tag_total_daily_volume)

shared_tag_remaining_demand = Σ(notStarted * emails_per_lead) over ALL campaigns on the tag
shared_tag_days_left        = ceil(shared_tag_remaining_demand / tag_total_daily_volume)
```
**`shared_tag_days_left`** is the main operational number.

### Status rules
| Status      | Condition |
|-------------|-----------|
| Ended       | `notStarted = 0` |
| No capacity | no tag mapped **or** tag volume = 0 |
| Critical    | `shared_tag_days_left ≤ 2` |
| Upload soon | `shared_tag_days_left ≤ 4` |
| Healthy     | `shared_tag_days_left > 4` |

Default sort (ending soonest first): Critical → Upload soon → No capacity → Healthy → Ended.

### Campaign → Tag mapping
Analytics doesn't return the sending tag, so map `campaign_id → tag_name` manually.
The mapper supports campaign search, tag search, an only-unmapped filter, per-row dropdowns,
and **bulk assign** of selected campaigns to one tag. Mappings persist in `localStorage`.

## Error handling
- Analytics/list/account failures surface the **exact** HTTP status + raw response preview.
- A missing `results` array shows the raw response preview.
- If names can't be fetched, rows fall back to `Campaign <id>` with a warning.
- **Never** falls back to mock data.

## Project structure
```
src/
  App.tsx                          state, localStorage, layout
  types.ts                         raw + normalized models
  services/smartlead.ts            fetch, pagination, chunked analytics, normalization
  utils/campaignCalculations.ts    pure depletion + status + sort logic
  utils/tagCapacity.ts             tag volume aggregation
  components/
    ConnectionPanel.tsx
    SummaryCards.tsx
    CampaignTable.tsx              dense, sticky-header table + StatusBadge
    TagVolumeTable.tsx
    CampaignDetailPanel.tsx
    CampaignTagMapper.tsx          search + filter + bulk assign
```

> **CORS note:** Calling Smartlead directly from the browser may be blocked in production.
> If so, proxy these endpoints through a small backend and point `services/smartlead.ts` at it.
