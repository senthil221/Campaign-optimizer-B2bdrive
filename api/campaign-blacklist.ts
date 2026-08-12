import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'
// Upstream returns one entry per connected sending domain, so a handful of
// campaigns already covers most domains. The client sends small chunks and
// stops early once every managed domain is accounted for, so this cap is just
// a safety net for a single request.
const CONCURRENCY = 8
const MAX_CAMPAIGNS = 500

interface Listing {
  target: 'domain' | 'ip'
  rblName: string
  rblWebsite: string
  reason: string
}

interface DomainBlacklistStatus {
  domain: string
  ip: string | null
  domainBlacklistCount: number
  ipBlacklistCount: number
  totalTests: number
  listings: Listing[]
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function toListings(rows: unknown[], target: 'domain' | 'ip'): Listing[] {
  return rows.map((row) => {
    const r = asObject(row)
    return {
      target,
      rblName: String(r.rbl_name ?? ''),
      rblWebsite: String(r.rbl_website ?? ''),
      reason: String(r.reason ?? ''),
    }
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const jwt =
    process.env.SMARTLEAD_JWT ||
    (req.headers['x-smartlead-jwt'] as string) ||
    ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel Settings.',
    })
  }

  const body = asObject(req.body)
  const campaignIds = Array.from(
    new Set(
      asArray(body.campaignIds)
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).slice(0, MAX_CAMPAIGNS)
  if (campaignIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'Body must include a non-empty campaignIds array.' })
  }

  // First writer wins per domain: blacklist state is domain/IP-level, so the
  // same domain reported by a later campaign carries identical status.
  const byDomain = new Map<string, DomainBlacklistStatus>()
  const failures: number[] = []
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < campaignIds.length) {
      const id = campaignIds[cursor++]
      try {
        const upstream = await fetch(
          `${SMARTLEAD_BASE}/api/email-campaigns/${id}/black-list-domains`,
          { method: 'GET', headers: { Authorization: `Bearer ${jwt}` } },
        )
        if (!upstream.ok) {
          failures.push(id)
          continue
        }
        const json = JSON.parse(await upstream.text()) as unknown
        for (const entry of asArray(json)) {
          const domainInfo = asObject(asObject(entry).domain)
          const domain = String(domainInfo.domain ?? '').trim().toLowerCase()
          if (!domain || byDomain.has(domain)) continue

          const ipInfo = asObject(asObject(entry).ip)
          const summary = asObject(domainInfo.summary)
          const domainListings = asArray(domainInfo.blacklisted)
          const ipListings = asArray(ipInfo.blacklisted)

          byDomain.set(domain, {
            domain,
            ip: ipInfo.ip
              ? String(ipInfo.ip)
              : summary.ip
                ? String(summary.ip)
                : null,
            domainBlacklistCount: domainListings.length,
            ipBlacklistCount: ipListings.length,
            totalTests:
              Number(summary.totalTests) || domainListings.length,
            listings: [
              ...toListings(domainListings, 'domain'),
              ...toListings(ipListings, 'ip'),
            ],
          })
        }
      } catch {
        failures.push(id)
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, campaignIds.length) }, worker),
    )
  } catch (error) {
    return res.status(502).json({
      error: `Blacklist proxy failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  res.setHeader('cache-control', 'private, max-age=0, no-store')
  return res
    .status(200)
    .json({ domains: Array.from(byDomain.values()), failures })
}
