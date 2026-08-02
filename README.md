# Campaign Lead Forecast

A professional cold-email agency operations dashboard (React + Vite + TypeScript + Tailwind) that
uses **only real Smartlead data** to forecast **when each campaign / tag runs out of leads**, so you
can upload more before it ends. No mock data, no fake fallbacks. Auto-loads on open; map campaigns to
tags inline and every depletion number recalculates instantly.

## Quick start

```bash
npm install
npm run build    # type-check + production build

# Local dev WITH the serverless proxy (recommended):
npm i -g vercel
vercel dev       # runs Vite + /api functions together, reads .env

# Or UI only (no proxy — /api calls will 404 unless you pass a JWT override):
npm run dev
```

The dashboard **auto-loads** campaigns + tags on open (credentials come from the server-side proxy
env vars — there are no JWT/API-key inputs in the UI). Use the **Refresh** button to refetch.

Workflow:
1. Campaigns load with real lead stats; most start **Unmapped**.
2. Pick a **tag** in each campaign row (or select rows and **bulk assign**). Mapping saves to
   `localStorage` and the row's demand / days-left / shared-tag-days / status recalculate instantly.
3. Sort puts action-needed campaigns first: Critical → Upload soon → Unmapped → No capacity →
   Healthy → Ended.

## Secrets & CORS — the serverless proxy

The browser never calls `server.smartlead.ai` directly (that would leak the JWT and hit CORS).
Instead it calls same-origin functions under `/api/*` which add the secret and forward the request:

| Browser → | Serverless function → Smartlead |
|-----------|----------------------------------|
| `GET /api/email-accounts?offset=` | `/api/email-account/get-total-email-accounts` |
| `GET /api/campaign-list?offset=`  | `/api/email-campaigns/get-all-campaigns` (incl. campaign tags) |
| `POST /api/campaign-analytics`    | `/api/email-campaigns/get-campaign-analytics` |
| `POST /api/domain-settings`       | Hypertide's Smartlead bulk settings helper |

### Domain management

The **Domain management** tab groups the already-loaded inboxes by the domain
portion of `from_email`. When every inbox on a domain has the same
`message_per_day`, that shared value is shown as the **Domain daily limit**.
Domains with inconsistent inbox settings are labelled with their minimum and
maximum instead of presenting the summed capacity as a per-inbox limit.

Select one or more domains to bulk update all matching inboxes:

- existing Smartlead tags;
- outbound `messagePerDay` and `minTimeToWaitInMins`;
- warmup maximum, ramp value/toggle, reply rate, and tag identifier.

The browser posts the selected inbox rows to the same-origin
`/api/domain-settings` function. The function validates that every inbox
belongs to a selected domain, injects `SMARTLEAD_JWT` server-side, and relays
the request to the Hypertide endpoints supplied for this workflow. The JWT is
never returned to or stored in the browser.

### Deploy on Vercel
1. Import the repo into Vercel (framework auto-detected as **Vite**, functions auto-detected in `/api`).
2. **Project → Settings → Environment Variables** add:
   - `SMARTLEAD_JWT` = your Smartlead JWT  *(required)*
   - `SMARTLEAD_API_KEY` = *(optional)*
3. Deploy. Open the app and click **Fetch accounts / tags** / **Fetch campaigns** — no token in the browser.

> ⚠️ Do **not** prefix these with `VITE_`. `VITE_` env vars are inlined into the public JS bundle
> and would expose your JWT. Server-side vars (no prefix) stay on the server.

For local dev, copy `.env.example` → `.env`, fill in `SMARTLEAD_JWT`, and run `vercel dev`.

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
     `{ "args": { "campaign_ids": "{3434132,3433660,3432770}" } }`. Empty body does **not** work.
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
| Unmapped    | no tag selected |
| No capacity | mapped tag volume = 0 |
| Critical    | `shared_tag_days_left ≤ 2` |
| Upload soon | `shared_tag_days_left ≤ 4` |
| Healthy     | `shared_tag_days_left > 4` |

Default sort (action first): Critical → Upload soon → Unmapped → No capacity → Healthy → Ended.

### Campaign → Tag mapping
Analytics doesn't return the sending tag, so each campaign row has an **inline tag dropdown**.
Selecting a tag saves `campaign_id → tag_name` to `localStorage` and recalculates the row
immediately. A bulk bar above the table (search, status filter, select-visible, bulk-assign)
maps many campaigns at once. The Tag Volume panel shows each pool's mapped-campaign count and
shared-tag days so you can see which pools deplete first.

## Error handling
- Analytics/list/account failures surface the **exact** HTTP status + raw response preview.
- A missing `results` array shows the raw response preview.
- If names can't be fetched, rows fall back to `Campaign <id>` with a warning.
- **Never** falls back to mock data.

## Project structure
```
api/                               Vercel serverless proxy (holds the secret)
  email-accounts.ts
  campaign-list.ts
  campaign-analytics.ts
src/
  App.tsx                          auto-fetch, state, layout
  types.ts                         raw + normalized models
  services/smartlead.ts            fetch, pagination, chunked analytics, normalization
  utils/campaignCalculations.ts    pure demand/days/status/sort + tag forecasts
  utils/tagCapacity.ts             tag volume aggregation from message_per_day
  utils/storage.ts                 localStorage (tag map + emails/lead)
  components/
    Header.tsx                     title, emails/lead, last-updated, Refresh
    SummaryCards.tsx               KPI cards
    CampaignForecastTable.tsx      main table: inline tag dropdown + bulk + filters
    TagVolumePanel.tsx             compact tag pool panel with shared-tag days
    StatusBadge.tsx
```

> All Smartlead calls go through the `/api/*` serverless proxy, so there is no CORS issue and the
> JWT is never present in the browser bundle.
