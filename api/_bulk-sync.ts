import type { VercelRequest, VercelResponse } from '@vercel/node'

// Underscore-prefixed API files are bundled as helpers, not deployed as routes.

const SMARTLEAD_BASE = 'https://server.smartlead.ai/api/v1'
const PREVIEW_CONCURRENCY = 3
const EXECUTE_CONCURRENCY = 2
const MAX_CAMPAIGNS_PER_REQUEST = 25
const MAX_POOLS_PER_REQUEST = 25
const MAX_ACCOUNTS_PER_POOL = 50_000

interface RawCampaignTarget {
  campaignId?: unknown
  campaignName?: unknown
  tagKey?: unknown
  tagName?: unknown
}

interface RawTagPool {
  tagKey?: unknown
  tagName?: unknown
  accountIds?: unknown
}

interface ValidatedTarget {
  campaignId: number
  campaignName: string
  tagName: string
  desiredAccountIds: number[]
}

function normalizeTag(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  )
}

function validatePlan(value: unknown): ValidatedTarget[] {
  const plan = objectValue(value)
  const rawCampaigns = Array.isArray(plan.campaigns)
    ? (plan.campaigns as RawCampaignTarget[])
    : []
  const rawPools = Array.isArray(plan.pools) ? (plan.pools as RawTagPool[]) : []

  if (rawCampaigns.length === 0) throw new Error('No campaigns are eligible for bulk sync.')
  if (rawCampaigns.length > MAX_CAMPAIGNS_PER_REQUEST) {
    throw new Error(`A maximum of ${MAX_CAMPAIGNS_PER_REQUEST} campaigns can be processed per request.`)
  }
  if (rawPools.length === 0 || rawPools.length > MAX_POOLS_PER_REQUEST) {
    throw new Error(`Provide between 1 and ${MAX_POOLS_PER_REQUEST} tag pools.`)
  }

  const pools = new Map<string, { tagName: string; accountIds: number[] }>()
  for (const raw of rawPools) {
    const tagName = String(raw.tagName ?? '').trim()
    const key = normalizeTag(raw.tagKey)
    const accountIds = positiveIds(raw.accountIds)
    if (!key || key !== normalizeTag(tagName)) {
      throw new Error('A tag pool has an invalid name or key.')
    }
    if (pools.has(key)) throw new Error(`Duplicate tag pool: ${tagName}.`)
    if (accountIds.length === 0) {
      throw new Error(`The "${tagName}" tag has no connected email accounts.`)
    }
    if (accountIds.length > MAX_ACCOUNTS_PER_POOL) {
      throw new Error(`The "${tagName}" tag exceeds the ${MAX_ACCOUNTS_PER_POOL} account safety limit.`)
    }
    pools.set(key, { tagName, accountIds })
  }

  const campaignIds = new Set<number>()
  return rawCampaigns.map((raw) => {
    const campaignId = Number(raw.campaignId)
    const campaignName = String(raw.campaignName ?? '').trim()
    const tagKey = normalizeTag(raw.tagKey)
    const tagName = String(raw.tagName ?? '').trim()
    const pool = pools.get(tagKey)
    if (!Number.isInteger(campaignId) || campaignId <= 0 || !campaignName) {
      throw new Error('A campaign has an invalid ID or name.')
    }
    if (campaignIds.has(campaignId)) {
      throw new Error(`Campaign ${campaignId} appears more than once.`)
    }
    campaignIds.add(campaignId)
    if (!pool || normalizeTag(tagName) !== tagKey) {
      throw new Error(`Campaign ${campaignName} references an invalid tag pool.`)
    }
    return {
      campaignId,
      campaignName: campaignName.slice(0, 300),
      tagName: pool.tagName,
      desiredAccountIds: pool.accountIds,
    }
  })
}

async function smartleadRequest(
  apiKey: string,
  campaignId: number,
  method: 'GET' | 'POST' | 'DELETE',
  accountIds?: number[],
): Promise<unknown> {
  const url = `${SMARTLEAD_BASE}/campaigns/${campaignId}/email-accounts?api_key=${encodeURIComponent(apiKey)}${
    method === 'GET' ? '&include_tags=true' : ''
  }`
  const upstream = await fetch(url, {
    method,
    headers: accountIds ? { 'content-type': 'application/json' } : undefined,
    body: accountIds
      ? JSON.stringify({ email_account_ids: accountIds })
      : undefined,
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    const detail = text.trim().slice(0, 400)
    throw new Error(
      `Smartlead ${method} failed (${upstream.status})${detail ? `: ${detail}` : '.'}`,
    )
  }
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function extractCurrentIds(payload: unknown): number[] {
  const root = objectValue(payload)
  const data = root.data
  let rows: unknown[] = []
  if (Array.isArray(payload)) rows = payload
  else if (Array.isArray(data)) rows = data
  else if (Array.isArray(objectValue(data).email_accounts)) {
    rows = objectValue(data).email_accounts as unknown[]
  } else if (Array.isArray(root.email_accounts)) {
    rows = root.email_accounts
  }
  return positiveIds(rows.map((row) => objectValue(row).id))
}

async function currentAccountIds(
  apiKey: string,
  campaignId: number,
): Promise<number[]> {
  return extractCurrentIds(
    await smartleadRequest(apiKey, campaignId, 'GET'),
  )
}

function diff(currentIds: number[], desiredIds: number[]) {
  const current = new Set(currentIds)
  const desired = new Set(desiredIds)
  return {
    toAdd: desiredIds.filter((id) => !current.has(id)),
    toRemove: currentIds.filter((id) => !desired.has(id)),
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = nextIndex++
        if (index >= items.length) return
        results[index] = await worker(items[index])
      }
    },
  )
  await Promise.all(runners)
  return results
}

async function previewTargets(apiKey: string, targets: ValidatedTarget[]) {
  return mapWithConcurrency(targets, PREVIEW_CONCURRENCY, async (target) => {
    try {
      const currentIds = await currentAccountIds(apiKey, target.campaignId)
      const { toAdd, toRemove } = diff(currentIds, target.desiredAccountIds)
      return {
        campaignId: target.campaignId,
        campaignName: target.campaignName,
        tagName: target.tagName,
        currentCount: currentIds.length,
        desiredCount: target.desiredAccountIds.length,
        toAddCount: toAdd.length,
        toRemoveCount: toRemove.length,
      }
    } catch (error) {
      return {
        campaignId: target.campaignId,
        campaignName: target.campaignName,
        tagName: target.tagName,
        currentCount: 0,
        desiredCount: target.desiredAccountIds.length,
        toAddCount: 0,
        toRemoveCount: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

async function executeTargets(apiKey: string, targets: ValidatedTarget[]) {
  return mapWithConcurrency(targets, EXECUTE_CONCURRENCY, async (target) => {
    let added = 0
    let removed = 0
    try {
      // Re-read immediately before writing so execution never trusts a stale preview.
      const currentIds = await currentAccountIds(apiKey, target.campaignId)
      const { toAdd, toRemove } = diff(currentIds, target.desiredAccountIds)
      if (toAdd.length === 0 && toRemove.length === 0) {
        return {
          campaignId: target.campaignId,
          campaignName: target.campaignName,
          tagName: target.tagName,
          status: 'unchanged' as const,
          added,
          removed,
        }
      }

      // Add first so an active campaign is never left without senders mid-sync.
      if (toAdd.length > 0) {
        await smartleadRequest(apiKey, target.campaignId, 'POST', toAdd)
        added = toAdd.length
      }
      if (toRemove.length > 0) {
        await smartleadRequest(apiKey, target.campaignId, 'DELETE', toRemove)
        removed = toRemove.length
      }

      return {
        campaignId: target.campaignId,
        campaignName: target.campaignName,
        tagName: target.tagName,
        status: 'synced' as const,
        added,
        removed,
      }
    } catch (error) {
      return {
        campaignId: target.campaignId,
        campaignName: target.campaignName,
        tagName: target.tagName,
        status: 'error' as const,
        added,
        removed,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

export async function handleBulkSync(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const apiKey =
    process.env.SMARTLEAD_API_KEY ||
    (req.headers['x-smartlead-api-key'] as string) ||
    ''
  if (!apiKey) {
    return res.status(400).json({
      error:
        'Bulk Sync requires SMARTLEAD_API_KEY in the Vercel environment variables.',
    })
  }

  try {
    const body = objectValue(req.body)
    const action = String(body.action ?? '')
    if (action !== 'preview' && action !== 'execute') {
      return res.status(400).json({ error: 'Action must be preview or execute.' })
    }
    const targets = validatePlan(body.plan)
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    if (action === 'preview') {
      return res.status(200).json({ previews: await previewTargets(apiKey, targets) })
    }
    return res.status(200).json({ results: await executeTargets(apiKey, targets) })
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
