/**
 * A Smartlead token as pasted into Vercel, minus the usual copy mistakes:
 * surrounding whitespace or quotes, and a leading "Bearer " (every proxy adds
 * its own, so a pasted one became "Bearer Bearer …" and Smartlead rejected it
 * as an invalid token).
 */
export function cleanSmartleadJwt(raw: unknown): string {
  let token = typeof raw === 'string' ? raw.trim() : ''
  if (/^(["']).*\1$/s.test(token)) token = token.slice(1, -1).trim()
  return token.replace(/^bearer\s+/i, '').trim()
}

/** The server's SMARTLEAD_JWT, falling back to one the dashboard sent. */
export function smartleadJwt(req?: { headers?: Record<string, unknown> }): string {
  return (
    cleanSmartleadJwt(process.env.SMARTLEAD_JWT) ||
    cleanSmartleadJwt(req?.headers?.['x-smartlead-jwt'])
  )
}

/**
 * Why a token cannot work, without revealing it: Smartlead only answers
 * "invalid token", which does not say whether the value was cut off, is not a
 * JWT at all, or has simply expired.
 */
export function jwtProblem(token: string, now = Date.now()): string | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+=*$/.test(part))) {
    return `SMARTLEAD_JWT is not a complete token: a Smartlead token has three parts separated by dots, but this one has ${parts.length} and is ${token.length} characters long. Re-copy the value after "Bearer " from a Smartlead request, paste it into Vercel, and redeploy.`
  }
  let exp: unknown
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    exp = (JSON.parse(json) as Record<string, unknown>).exp
  } catch {
    return 'SMARTLEAD_JWT is damaged: its middle part cannot be decoded. Re-copy it from a Smartlead request, paste it into Vercel, and redeploy.'
  }
  if (typeof exp === 'number' && exp * 1000 < now) {
    return `SMARTLEAD_JWT expired on ${new Date(exp * 1000).toISOString()}. Copy a fresh token from a Smartlead request, paste it into Vercel, and redeploy.`
  }
  return null
}
