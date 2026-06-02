# Smartlead Campaign End-Date Dashboard

A lightweight operational dashboard (React + Vite + TypeScript + Tailwind) that tells you
**when each Smartlead campaign / tag will run out of leads**, so you can upload more before it ends.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Click **Load mock data** to explore the app with zero credentials.

## How it works

### Data sources
1. **Email accounts (by JWT)** — `GET /api/email-account/get-total-email-accounts`
   - Bearer JWT auth, `limit=100`, paginated with `offset += 100` (small delay between pages).
   - Accounts are deduplicated by `id` and grouped by tag.
2. **Campaign analytics** — `POST /api/email-campaigns/get-campaign-analytics`
   - Works with JWT and/or API key.

Response shapes are handled safely (`json.data.email_accounts`, `json.data`, `json.email_accounts`, …)
and missing fields never crash the UI.

### Tag capacity (per tag)
- `total_daily_capacity = Σ message_per_day`
- `used_today = Σ daily_sent_count`
- `remaining_today = total_daily_capacity − used_today`
- `avg_warmup_reputation`

### Depletion math
Each lead receives `emails_per_lead` emails (configurable, default **2**).

```
remaining_email_demand   = notStarted * emails_per_lead
campaign_days_left       = ceil(remaining_email_demand / tag_total_daily_capacity)

tag_total_remaining_demand = Σ(notStarted * emails_per_lead) over ALL active campaigns on the tag
shared_tag_days_left       = ceil(tag_total_remaining_demand / tag_total_daily_capacity)
```

**`shared_tag_days_left`** is the main operational number — it accounts for every campaign
competing for the same sending capacity.

### Alert rules
| Level        | Condition |
|--------------|-----------|
| Ended        | `notStarted = 0` |
| No capacity  | tag missing or `tag_daily_capacity = 0` |
| Critical     | `progress ≥ 80%` **or** `shared_tag_days_left ≤ 2` |
| Upload soon  | `progress ≥ 70%` **or** `shared_tag_days_left ≤ 3` |
| Healthy      | otherwise |

Progress = `completed / total * 100`. Rows are tinted at 70–79% (amber), 80%+ (red),
and `notStarted = 0` (rose/end state).

### Campaign → Tag mapping
Smartlead analytics may not return the tag, so map `campaign_id → tag_name` manually.
Mappings (plus JWT / API key / emails-per-lead) are saved in `localStorage`.

## Project structure
```
src/
  App.tsx                      state, localStorage, layout
  types.ts                     raw + normalized models
  services/smartlead.ts        fetch, pagination, normalization, mock data
  utils/calculations.ts        pure depletion + alert logic (no UI)
  components/
    ConnectionPanel.tsx
    CampaignTable.tsx
    CampaignStatsPanel.tsx
    CampaignTagMapper.tsx
    TagCapacityTable.tsx
    AlertBadge.tsx
```

> **Note:** Calling Smartlead directly from the browser may hit CORS in production.
> If so, proxy the two endpoints through a tiny backend and point the service at it.
