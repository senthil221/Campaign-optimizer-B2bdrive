import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSnapshotStatus, runSnapshotStep } from './_lib/smartlead-snapshot.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })

  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured.' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }
  const jwt = process.env.SMARTLEAD_JWT?.trim()
  if (!jwt) return res.status(503).json({ error: 'SMARTLEAD_JWT is not configured.' })

  const deadline = Date.now() + 45_000
  try {
    let status = await readSnapshotStatus()
    let first = true
    for (let step = 0; step < 64 && Date.now() < deadline; step++) {
      status = await runSnapshotStep(jwt, 8, first)
      first = false
      if (status.phase === 'complete') break
    }
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    return res.status(200).json({ status })
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
