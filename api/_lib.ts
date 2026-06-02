import type { VercelRequest, VercelResponse } from '@vercel/node'

export const SMARTLEAD_BASE = 'https://server.smartlead.ai'

/**
 * Resolve the Smartlead JWT.
 * Priority: server env var (secret, never sent to the browser) → optional
 * per-request header override (handy for local dev / testing).
 */
export function resolveJwt(req: VercelRequest): string {
  const header = (req.headers['x-smartlead-jwt'] as string) || ''
  return process.env.SMARTLEAD_JWT || header || ''
}

/** Optional API key (only used if you proxy api-key based endpoints). */
export function resolveApiKey(req: VercelRequest): string {
  const header = (req.headers['x-smartlead-api-key'] as string) || ''
  return process.env.SMARTLEAD_API_KEY || header || ''
}

/**
 * Forward a Smartlead response back to the browser verbatim (status + body),
 * so the client can surface exact errors and raw response previews.
 */
export async function pipe(res: VercelResponse, upstream: Response) {
  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.send(text)
}

export function noJwt(res: VercelResponse) {
  res.status(400).json({
    error:
      'No Smartlead JWT configured. Set the SMARTLEAD_JWT environment variable in Vercel (Project → Settings → Environment Variables), or pass one from the UI.',
  })
}
