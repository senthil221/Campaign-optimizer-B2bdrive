import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  compactAccounts,
  paginatedDomainInboxes,
  paginatedDomains,
  readSnapshotStatus,
  runSnapshotStep,
  snapshotEnabled,
} from './_lib/smartlead-snapshot.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!snapshotEnabled()) {
    return res.status(503).json({
      enabled: false,
      error: 'DATABASE_URL is not configured; using the direct Smartlead fallback.',
    })
  }

  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''

  try {
    if (req.method === 'GET') {
      const mode = String(req.query.mode ?? 'compact')
      if (mode === 'status') {
        res.setHeader('cache-control', 'private, max-age=0, no-store')
        return res.status(200).json({ status: await readSnapshotStatus() })
      }
      if (mode === 'domains') {
        const page = Number(req.query.page) || 1
        const pageSize = Number(req.query.pageSize) || 50
        const search = String(req.query.search ?? '')
        res.setHeader('cache-control', 'private, max-age=30, stale-while-revalidate=120')
        return res.status(200).json(await paginatedDomains({ page, pageSize, search }))
      }
      if (mode === 'inboxes') {
        const page = Number(req.query.page) || 1
        const pageSize = Number(req.query.pageSize) || 100
        const domain = String(req.query.domain ?? '').trim().toLowerCase()
        if (!domain) return res.status(400).json({ error: 'domain is required.' })
        res.setHeader('cache-control', 'private, max-age=30, stale-while-revalidate=120')
        return res.status(200).json(
          await paginatedDomainInboxes({ domain, page, pageSize }),
        )
      }
      const status = await readSnapshotStatus()
      const accounts = status.accountCount > 0 ? await compactAccounts() : []
      res.setHeader('cache-control', 'private, max-age=30, stale-while-revalidate=120')
      return res.status(200).json({ accounts, status })
    }

    if (req.method === 'POST') {
      if (!jwt) return res.status(400).json({ error: 'SMARTLEAD_JWT is not configured.' })
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const status = await runSnapshotStep(
        jwt,
        Number((body as Record<string, unknown>).pages) || 8,
        (body as Record<string, unknown>).force === true,
      )
      res.setHeader('cache-control', 'private, max-age=0, no-store')
      return res.status(200).json({ status })
    }

    return res.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
