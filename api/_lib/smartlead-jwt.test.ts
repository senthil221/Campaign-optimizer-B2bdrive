import { afterEach, describe, expect, it } from 'vitest'

import { cleanSmartleadJwt, jwtProblem, smartleadJwt } from './smartlead-jwt.js'

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
// Expires 2100-01-01.
const TOKEN = `${part({ alg: 'HS256' })}.${part({ sub: 'u', exp: 4102444800 })}.c2ln`

const OLD_ENV = process.env.SMARTLEAD_JWT
afterEach(() => {
  process.env.SMARTLEAD_JWT = OLD_ENV
})

describe('cleaning a pasted Smartlead token', () => {
  it('strips the copy mistakes that made Smartlead answer "invalid token"', () => {
    for (const pasted of [
      TOKEN,
      `Bearer ${TOKEN}`,
      `bearer ${TOKEN}`,
      `  ${TOKEN}\n`,
      `"${TOKEN}"`,
      `'Bearer ${TOKEN}'`,
      ` "Bearer ${TOKEN}" \r\n`,
    ]) {
      expect(cleanSmartleadJwt(pasted)).toBe(TOKEN)
    }
  })

  it('prefers the server token and falls back to one sent by the dashboard', () => {
    process.env.SMARTLEAD_JWT = `Bearer ${TOKEN}\n`
    expect(smartleadJwt({ headers: { 'x-smartlead-jwt': 'other' } })).toBe(TOKEN)

    process.env.SMARTLEAD_JWT = '   '
    expect(smartleadJwt({ headers: { 'x-smartlead-jwt': ` ${TOKEN} ` } })).toBe(TOKEN)
    expect(smartleadJwt()).toBe('')
  })
})

describe('diagnosing a token that cannot work', () => {
  it('accepts a complete, unexpired token', () => {
    expect(jwtProblem(TOKEN)).toBeNull()
  })

  it('names a cut-off token by its part count, never its value', () => {
    const cut = TOKEN.slice(0, TOKEN.lastIndexOf('.'))
    const problem = jwtProblem(cut)
    expect(problem).toContain('has 2 and is')
    expect(problem).not.toContain(cut)
  })

  it('reports when the token has expired', () => {
    const expired = `${part({ alg: 'HS256' })}.${part({ exp: 1_700_000_000 })}.c2ln`
    expect(jwtProblem(expired)).toContain('expired on 2023-11-14')
  })

  it('reports a middle part that is not a readable payload', () => {
    expect(jwtProblem('abc.@@@.def')).toContain('not a complete token')
    expect(jwtProblem('abc.def.ghi')).toContain('damaged')
  })
})
