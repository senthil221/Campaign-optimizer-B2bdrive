-- Durable, resumable Smartlead inbox projection.
-- The application also runs these idempotent statements during first use so a
-- fresh Vercel database can become operational without a separate migration CLI.
create table if not exists smartlead_sync_state (
  tenant_key text primary key,
  run_token text,
  phase text not null default 'active',
  page_offset integer not null default 0,
  fetched_count integer not null default 0,
  status text not null default 'idle',
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists smartlead_accounts (
  tenant_key text not null,
  smartlead_id bigint not null,
  from_email text not null default '',
  normalized_domain text not null default '',
  from_name text not null default '',
  provider_type text not null default '',
  created_at timestamptz,
  message_per_day integer not null default 0,
  daily_sent_count integer not null default 0,
  warmup_status text not null default 'UNKNOWN',
  warmup_reputation numeric not null default 0,
  connected boolean not null default true,
  is_in_use boolean not null default false,
  dns_spf_verified boolean not null default false,
  dns_dkim_verified boolean not null default false,
  dns_dmarc_verified boolean not null default false,
  dns_last_verified_at timestamptz,
  tag_ids jsonb not null default '[]'::jsonb,
  tag_names jsonb not null default '[]'::jsonb,
  raw_account jsonb not null,
  run_token text not null,
  last_seen_at timestamptz not null default now(),
  primary key (tenant_key, smartlead_id)
);

create index if not exists smartlead_accounts_tenant_domain_idx
  on smartlead_accounts (tenant_key, normalized_domain, smartlead_id);
create index if not exists smartlead_accounts_tenant_usage_idx
  on smartlead_accounts (tenant_key, is_in_use, smartlead_id);
create index if not exists smartlead_accounts_tenant_email_idx
  on smartlead_accounts (tenant_key, lower(from_email));
create index if not exists smartlead_accounts_run_idx
  on smartlead_accounts (tenant_key, run_token);

create table if not exists smartlead_accounts_stage
  (like smartlead_accounts including defaults including constraints);
create unique index if not exists smartlead_accounts_stage_account_idx
  on smartlead_accounts_stage (tenant_key, smartlead_id);
create index if not exists smartlead_accounts_stage_run_idx
  on smartlead_accounts_stage (tenant_key, run_token);

-- These operational tables are backend-only. They intentionally have no Data
-- API policies; the trusted Vercel function connects through Postgres instead.
alter table smartlead_sync_state enable row level security;
alter table smartlead_accounts enable row level security;
alter table smartlead_accounts_stage enable row level security;

revoke all on table smartlead_sync_state from anon, authenticated, public;
revoke all on table smartlead_accounts from anon, authenticated, public;
revoke all on table smartlead_accounts_stage from anon, authenticated, public;
