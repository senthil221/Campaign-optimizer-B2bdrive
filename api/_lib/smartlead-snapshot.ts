import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const TENANT_KEY = 'primary'
const PAGE_LIMIT = 100
const DEFAULT_STEP_PAGES = 8
const MAX_STEP_PAGES = 12
const STALE_AFTER_MS = 15 * 60 * 1000
const SMARTLEAD_BASE = 'https://server.smartlead.ai'

type Sql = ReturnType<typeof postgres>
type SyncPhase = 'active' | 'idle' | 'complete'

export interface SnapshotStatus {
  enabled: boolean
  ready: boolean
  stale: boolean
  syncing: boolean
  phase: SyncPhase
  offset: number
  fetched: number
  accountCount: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

let client: Sql | null = null
let schemaPromise: Promise<void> | null = null

export function snapshotEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function database(): Sql {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not configured.')
  if (!client) {
    client = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  }
  return client
}

export async function ensureSnapshotSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = database()
      await sql.unsafe(`
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
      `)
    })().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function extractRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(objectValue)
  const root = objectValue(value)
  const direct = root.email_accounts
  if (Array.isArray(direct)) return direct.map(objectValue)
  const data = root.data
  if (Array.isArray(data)) return data.map(objectValue)
  const nested = objectValue(data)
  for (const key of ['email_accounts', 'results']) {
    if (Array.isArray(nested[key])) return nested[key].map(objectValue)
  }
  return []
}

function domainFromEmail(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1) : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function tagValues(raw: Record<string, unknown>): { ids: number[]; names: string[] } {
  const ids: number[] = []
  const names: string[] = []
  const mappings = Array.isArray(raw.email_account_tag_mappings)
    ? raw.email_account_tag_mappings
    : []
  for (const value of mappings) {
    const tag = objectValue(objectValue(value).tag)
    const id = Number(tag.id)
    const name = String(tag.name ?? '').trim()
    if (Number.isFinite(id) && id > 0) ids.push(id)
    if (name) names.push(name)
  }
  return { ids: Array.from(new Set(ids)), names: Array.from(new Set(names)) }
}

async function upsertPage(
  rows: Record<string, unknown>[],
  inUseFallback: boolean,
  runToken: string,
): Promise<number> {
  if (rows.length === 0) return 0
  const sql = database()
  const normalized = rows
    .map((raw) => {
      const id = Number(raw.id)
      if (!Number.isInteger(id) || id <= 0) return null
      const warmup = objectValue(raw.email_warmup_details)
      const dns = objectValue(raw.dns_validation_status)
      const tags = tagValues(raw)
      return {
        tenant_key: TENANT_KEY,
        smartlead_id: id,
        from_email: String(raw.from_email ?? ''),
        normalized_domain: domainFromEmail(raw.from_email),
        from_name: String(raw.from_name ?? ''),
        provider_type: String(raw.type ?? '').trim().toUpperCase(),
        created_at:
          typeof raw.created_at === 'string' && raw.created_at.trim()
            ? raw.created_at
            : null,
        message_per_day: numberValue(raw.message_per_day),
        daily_sent_count: numberValue(raw.daily_sent_count),
        warmup_status: String(warmup.status ?? 'UNKNOWN'),
        warmup_reputation: numberValue(warmup.warmup_reputation),
        connected: raw.is_smtp_success !== false && raw.is_imap_success !== false,
        is_in_use:
          typeof raw.is_in_use === 'boolean' ? raw.is_in_use : inUseFallback,
        dns_spf_verified: dns.isSPFVerified === true,
        dns_dkim_verified: dns.isDKIMVerified === true,
        dns_dmarc_verified: dns.isDMARCVerified === true,
        dns_last_verified_at:
          typeof dns.lastVerifiedTime === 'string' && dns.lastVerifiedTime.trim()
            ? dns.lastVerifiedTime
            : null,
        tag_ids: sql.json(tags.ids),
        tag_names: sql.json(tags.names),
        raw_account: sql.json(raw as postgres.JSONValue),
        run_token: runToken,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (normalized.length === 0) return 0
  await sql`
    insert into smartlead_accounts_stage ${sql(normalized)}
    on conflict (tenant_key, smartlead_id) do update set
      from_email = excluded.from_email,
      normalized_domain = excluded.normalized_domain,
      from_name = excluded.from_name,
      provider_type = excluded.provider_type,
      created_at = excluded.created_at,
      message_per_day = excluded.message_per_day,
      daily_sent_count = excluded.daily_sent_count,
      warmup_status = excluded.warmup_status,
      warmup_reputation = excluded.warmup_reputation,
      connected = excluded.connected,
      is_in_use = excluded.is_in_use,
      dns_spf_verified = excluded.dns_spf_verified,
      dns_dkim_verified = excluded.dns_dkim_verified,
      dns_dmarc_verified = excluded.dns_dmarc_verified,
      dns_last_verified_at = excluded.dns_last_verified_at,
      tag_ids = excluded.tag_ids,
      tag_names = excluded.tag_names,
      raw_account = excluded.raw_account,
      run_token = excluded.run_token,
      last_seen_at = now()
  `
  return normalized.length
}

async function smartleadPage(
  jwt: string,
  offset: number,
  inUse: boolean,
): Promise<Record<string, unknown>[]> {
  const url = `${SMARTLEAD_BASE}/api/email-account/get-total-email-accounts?offset=${offset}&limit=${PAGE_LIMIT}&isInUse=${inUse}`
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      })
      const text = await upstream.text()
      if (!upstream.ok) {
        const retryable = upstream.status === 429 || upstream.status >= 500
        if (!retryable) {
          throw new Error(`Smartlead account page failed (${upstream.status}): ${text.slice(0, 300)}`)
        }
        const retryAfter = Number(upstream.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 500 * 2 ** attempt + Math.floor(Math.random() * 250)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        continue
      }
      return extractRows(JSON.parse(text) as unknown)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * 2 ** attempt + Math.floor(Math.random() * 250)),
        )
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError ?? new Error('Smartlead account page failed after retries.')
}

export async function readSnapshotStatus(): Promise<SnapshotStatus> {
  if (!snapshotEnabled()) {
    return {
      enabled: false,
      ready: false,
      stale: false,
      syncing: false,
      phase: 'active',
      offset: 0,
      fetched: 0,
      accountCount: 0,
      startedAt: null,
      completedAt: null,
      error: null,
    }
  }
  await ensureSnapshotSchema()
  const sql = database()
  const [state] = await sql<
    Array<{
      phase: SyncPhase
      page_offset: number
      fetched_count: number
      status: string
      started_at: Date | null
      completed_at: Date | null
      last_error: string | null
      account_count: number
    }>
  >`
    select s.phase, s.page_offset, s.fetched_count, s.status, s.started_at,
           s.completed_at, s.last_error,
           (select count(*)::int from smartlead_accounts a where a.tenant_key = ${TENANT_KEY}) account_count
    from smartlead_sync_state s
    where s.tenant_key = ${TENANT_KEY}
  `
  if (!state) {
    const [countRow] = await sql<Array<{ account_count: number }>>`
      select count(*)::int account_count from smartlead_accounts where tenant_key = ${TENANT_KEY}
    `
    return {
      enabled: true,
      ready: (countRow?.account_count ?? 0) > 0,
      stale: true,
      syncing: false,
      phase: 'active',
      offset: 0,
      fetched: 0,
      accountCount: countRow?.account_count ?? 0,
      startedAt: null,
      completedAt: null,
      error: null,
    }
  }
  const completedAt = state.completed_at?.toISOString() ?? null
  return {
    enabled: true,
    ready: Boolean(completedAt),
    stale: !completedAt || Date.now() - new Date(completedAt).getTime() > STALE_AFTER_MS,
    syncing: state.status === 'syncing',
    phase: state.phase,
    offset: state.page_offset,
    fetched: state.fetched_count,
    accountCount: state.account_count,
    startedAt: state.started_at?.toISOString() ?? null,
    completedAt,
    error: state.last_error,
  }
}

async function runSnapshotStepUnlocked(
  jwt: string,
  requestedPages = DEFAULT_STEP_PAGES,
  force = false,
): Promise<SnapshotStatus> {
  await ensureSnapshotSchema()
  const sql = database()
  const pages = Math.max(1, Math.min(MAX_STEP_PAGES, Math.floor(requestedPages)))
  let [state] = await sql<
    Array<{
      run_token: string | null
      phase: SyncPhase
      page_offset: number
      status: string
      completed_at: Date | null
    }>
  >`select run_token, phase, page_offset, status, completed_at
    from smartlead_sync_state where tenant_key = ${TENANT_KEY}`

  const completedRecently =
    state?.completed_at && Date.now() - state.completed_at.getTime() <= STALE_AFTER_MS
  if (completedRecently && !force && state?.phase === 'complete') {
    return readSnapshotStatus()
  }

  if (!state || state.phase === 'complete') {
    const token = randomUUID()
    await sql`delete from smartlead_accounts_stage where tenant_key = ${TENANT_KEY}`
    await sql`
      insert into smartlead_sync_state
        (tenant_key, run_token, phase, page_offset, fetched_count, status, started_at, heartbeat_at, last_error, updated_at)
      values (${TENANT_KEY}, ${token}, 'active', 0, 0, 'syncing', now(), now(), null, now())
      on conflict (tenant_key) do update set
        run_token = excluded.run_token,
        phase = 'active', page_offset = 0, fetched_count = 0,
        status = 'syncing', started_at = now(), heartbeat_at = now(),
        last_error = null, updated_at = now()
    `
    state = { run_token: token, phase: 'active', page_offset: 0, status: 'syncing', completed_at: null }
  }

  const token = state.run_token ?? randomUUID()
  let phase: SyncPhase = state.phase
  let offset = state.page_offset
  try {
    for (let index = 0; index < pages && phase !== 'complete'; index++) {
      const inUse = phase === 'active'
      const rows = await smartleadPage(jwt, offset, inUse)
      const saved = await upsertPage(rows, inUse, token)
      if (rows.length < PAGE_LIMIT) {
        if (phase === 'active') {
          phase = 'idle'
          offset = 0
        } else {
          phase = 'complete'
          await sql.begin(async (transaction) => {
            await transaction`
              delete from smartlead_accounts where tenant_key = ${TENANT_KEY}
            `
            await transaction`
              insert into smartlead_accounts (
                tenant_key, smartlead_id, from_email, normalized_domain, from_name,
                provider_type, created_at, message_per_day, daily_sent_count,
                warmup_status, warmup_reputation, connected, is_in_use,
                dns_spf_verified, dns_dkim_verified, dns_dmarc_verified,
                dns_last_verified_at, tag_ids, tag_names, raw_account,
                run_token, last_seen_at
              )
              select tenant_key, smartlead_id, from_email, normalized_domain, from_name,
                provider_type, created_at, message_per_day, daily_sent_count,
                warmup_status, warmup_reputation, connected, is_in_use,
                dns_spf_verified, dns_dkim_verified, dns_dmarc_verified,
                dns_last_verified_at, tag_ids, tag_names, raw_account,
                run_token, last_seen_at
              from smartlead_accounts_stage
              where tenant_key = ${TENANT_KEY} and run_token = ${token}
            `
            await transaction`
              delete from smartlead_accounts_stage where tenant_key = ${TENANT_KEY}
            `
            await transaction`
              update smartlead_sync_state set phase = 'complete', page_offset = 0,
                status = 'idle', completed_at = now(), heartbeat_at = now(),
                last_error = null, updated_at = now()
              where tenant_key = ${TENANT_KEY}
            `
          })
          break
        }
      } else {
        offset += PAGE_LIMIT
      }
      await sql`
        update smartlead_sync_state set phase = ${phase}, page_offset = ${offset},
          fetched_count = fetched_count + ${saved}, status = 'syncing',
          heartbeat_at = now(), last_error = null, updated_at = now()
        where tenant_key = ${TENANT_KEY}
      `
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await sql`
      update smartlead_sync_state set status = 'error', last_error = ${message.slice(0, 1000)},
        heartbeat_at = now(), updated_at = now() where tenant_key = ${TENANT_KEY}
    `
    throw error
  }
  return readSnapshotStatus()
}

export async function runSnapshotStep(
  jwt: string,
  requestedPages = DEFAULT_STEP_PAGES,
  force = false,
): Promise<SnapshotStatus> {
  await ensureSnapshotSchema()
  const reserved = await database().reserve()
  const lockKey = `smartlead-snapshot:${TENANT_KEY}`
  try {
    const [lock] = await reserved<Array<{ acquired: boolean }>>`
      select pg_try_advisory_lock(hashtext(${lockKey})) acquired
    `
    if (!lock?.acquired) return readSnapshotStatus()
    try {
      return await runSnapshotStepUnlocked(jwt, requestedPages, force)
    } finally {
      await reserved`select pg_advisory_unlock(hashtext(${lockKey}))`
    }
  } finally {
    reserved.release()
  }
}

export async function compactAccounts() {
  await ensureSnapshotSchema()
  const sql = database()
  return sql`
    select smartlead_id::float8 as id,
      from_email as "fromEmail", from_name as "fromName", provider_type as "providerType",
      created_at as "createdAt", message_per_day as "messagePerDay",
      daily_sent_count as "dailySentCount", warmup_status as "warmupStatus",
      warmup_reputation::float8 as "warmupReputation", connected,
      is_in_use as "isInUse", dns_spf_verified as "dnsSpfVerified",
      dns_dkim_verified as "dnsDkimVerified", dns_dmarc_verified as "dnsDmarcVerified",
      dns_last_verified_at as "dnsLastVerifiedAt", tag_ids as "tagIds", tag_names as "tagNames"
    from smartlead_accounts
    where tenant_key = ${TENANT_KEY}
    order by smartlead_id
  `
}

export async function rawAccountsForDomains(domains: string[]) {
  await ensureSnapshotSchema()
  const sql = database()
  const rows = await sql<Array<{ raw_account: Record<string, unknown> }>>`
    select raw_account from smartlead_accounts
    where tenant_key = ${TENANT_KEY} and normalized_domain in ${sql(domains)}
    order by smartlead_id
  `
  return rows.map((row) => row.raw_account)
}

export async function deleteSnapshotAccounts(ids: number[]): Promise<void> {
  if (!snapshotEnabled() || ids.length === 0) return
  await ensureSnapshotSchema()
  const sql = database()
  await sql`
    delete from smartlead_accounts
    where tenant_key = ${TENANT_KEY} and smartlead_id in ${sql(ids)}
  `
}

export async function markSnapshotStale(): Promise<void> {
  if (!snapshotEnabled()) return
  await ensureSnapshotSchema()
  const sql = database()
  await sql`
    update smartlead_sync_state set completed_at = null, status = 'idle', updated_at = now()
    where tenant_key = ${TENANT_KEY}
  `
}

export async function paginatedDomains(options: {
  page: number
  pageSize: number
  search: string
}) {
  await ensureSnapshotSchema()
  const sql = database()
  const page = Math.max(1, options.page)
  const pageSize = Math.max(10, Math.min(100, options.pageSize))
  const offset = (page - 1) * pageSize
  const search = options.search.trim().toLowerCase()
  const predicate = search ? sql`and normalized_domain like ${`%${search}%`}` : sql``
  const [count] = await sql<Array<{ total: number }>>`
    select count(distinct normalized_domain)::int total
    from smartlead_accounts where tenant_key = ${TENANT_KEY}
      and normalized_domain <> '' ${predicate}
  `
  const rows = await sql`
    select normalized_domain as domain,
      count(*)::int as "accountCount",
      count(*) filter (where connected)::int as "connectedCount",
      count(*) filter (where upper(warmup_status) in ('ACTIVE','ENABLED','RUNNING'))::int as "warmupEnabledCount",
      min(created_at) as "createdAt",
      min(message_per_day)::int as "dailyLimitMin",
      max(message_per_day)::int as "dailyLimitMax"
    from smartlead_accounts
    where tenant_key = ${TENANT_KEY} and normalized_domain <> '' ${predicate}
    group by normalized_domain
    order by normalized_domain, min(smartlead_id)
    limit ${pageSize} offset ${offset}
  `
  return { rows, total: count?.total ?? 0, page, pageSize }
}

export async function paginatedDomainInboxes(options: {
  domain: string
  page: number
  pageSize: number
}) {
  await ensureSnapshotSchema()
  const sql = database()
  const domain = options.domain.trim().toLowerCase()
  const page = Math.max(1, options.page)
  const pageSize = Math.max(10, Math.min(200, options.pageSize))
  const offset = (page - 1) * pageSize
  const [count] = await sql<Array<{ total: number }>>`
    select count(*)::int total from smartlead_accounts
    where tenant_key = ${TENANT_KEY} and normalized_domain = ${domain}
  `
  const rows = await sql`
    select smartlead_id::float8 as id, from_email as "fromEmail", from_name as "fromName",
      provider_type as "providerType", message_per_day as "messagePerDay",
      daily_sent_count as "dailySentCount", warmup_status as "warmupStatus",
      warmup_reputation::float8 as "warmupReputation", connected,
      is_in_use as "isInUse", tag_names as "tagNames"
    from smartlead_accounts
    where tenant_key = ${TENANT_KEY} and normalized_domain = ${domain}
    order by lower(from_email), smartlead_id
    limit ${pageSize} offset ${offset}
  `
  return { rows, total: count?.total ?? 0, page, pageSize, domain }
}
