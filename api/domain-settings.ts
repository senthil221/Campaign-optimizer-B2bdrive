import type { VercelRequest, VercelResponse } from '@vercel/node'

const HYPERTIDE_BASE = 'https://smartlead.hypertide.io/smartlead/api'

type Action = 'tags' | 'outbound' | 'warmup'

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function domainFromEmail(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1) : ''
}

function integerInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    return null
  }
  return numberValue
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

  const body = objectValue(req.body)
  const action = String(body.action ?? '') as Action
  if (!['tags', 'outbound', 'warmup'].includes(action)) {
    return res.status(400).json({ error: 'Unknown bulk settings action.' })
  }

  const domains = Array.isArray(body.domains)
    ? Array.from(
        new Set(
          body.domains
            .map((value) => String(value).trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : []
  if (domains.length === 0) {
    return res.status(400).json({ error: 'Select at least one domain.' })
  }

  const domainSet = new Set(domains)
  const accountIds = new Set<number>()
  const accounts = (Array.isArray(body.accounts) ? body.accounts : [])
    .map(objectValue)
    .filter((account) => {
      const id = Number(account.id)
      const domain = domainFromEmail(account.from_email)
      if (!Number.isInteger(id) || id <= 0 || !domainSet.has(domain)) return false
      if (accountIds.has(id)) return false
      accountIds.add(id)
      return true
    })
  if (accounts.length === 0) {
    return res.status(400).json({
      error: 'No inboxes matched the selected domains.',
    })
  }

  let updateData: Record<string, unknown>
  if (action === 'tags') {
    const tags = Array.isArray(body.tags)
      ? Array.from(
          new Set(
            body.tags
              .map((value) => String(value).trim())
              .filter(Boolean),
          ),
        )
      : []
    if (tags.length === 0 || tags.length > 50) {
      return res.status(400).json({
        error: 'Provide between 1 and 50 existing Smartlead tag names.',
      })
    }
    updateData = { tags }
  } else if (action === 'outbound') {
    const settings = objectValue(body.settings)
    const messagePerDay = integerInRange(settings.messagePerDay, 0, 1000)
    const minTimeToWaitInMins = integerInRange(
      settings.minTimeToWaitInMins,
      0,
      1440,
    )
    if (messagePerDay === null || minTimeToWaitInMins === null) {
      return res.status(400).json({
        error:
          'Outbound settings require whole-number daily and wait-time limits.',
      })
    }
    updateData = {
      settings: {
        messagePerDay,
        minTimeToWaitInMins,
        status: 'ACTIVE',
      },
    }
  } else {
    const settings = objectValue(body.settings)
    const maxEmailPerDay = integerInRange(settings.maxEmailPerDay, 0, 1000)
    const rampupValue = integerInRange(settings.rampupValue, 0, 1000)
    const replyRate = integerInRange(settings.replyRate, 0, 100)
    const warmupTagIdentifier = String(
      settings.warmupTagIdentifier ?? '',
    ).trim()
    if (
      maxEmailPerDay === null ||
      rampupValue === null ||
      replyRate === null ||
      warmupTagIdentifier.length > 100
    ) {
      return res.status(400).json({
        error: 'Warmup settings contain an invalid value.',
      })
    }
    updateData = {
      settings: {
        isRampupEnabled: settings.isRampupEnabled === true,
        maxEmailPerDay,
        rampupValue,
        replyRate,
        status: 'ACTIVE',
        warmupTagIdentifier,
      },
    }
  }

  const endpoint =
    action === 'tags'
      ? 'update_tags'
      : action === 'outbound'
        ? 'update_outbound'
        : 'update_warmup'

  try {
    const upstream = await fetch(`${HYPERTIDE_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: jwt,
        accounts,
        domains,
        ...updateData,
      }),
    })
    const text = await upstream.text()
    res.setHeader('cache-control', 'private, max-age=0, no-store')
    res.status(upstream.status)
    res.setHeader(
      'content-type',
      upstream.headers.get('content-type') ||
        'application/json; charset=utf-8',
    )
    return res.send(text)
  } catch (error) {
    return res.status(502).json({
      error: `Bulk ${action} update failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}
