import type { VercelRequest, VercelResponse } from '@vercel/node'

const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// Two ways to READ a campaign's sequences, tried in order until one returns
// data. Both are normalized to the same camelCase save shape below, so it
// doesn't matter which one answers.
//   1) internal editor endpoint (JWT bearer, camelCase)
//   2) public API endpoint (api_key, snake_case) — the documented fallback
const internalListUrl = (campaignId: number) =>
  `${SMARTLEAD_BASE}/api/email-campaigns/${campaignId}/sequences`
const v1ListUrl = (campaignId: number, apiKey: string) =>
  `${SMARTLEAD_BASE}/api/v1/campaigns/${campaignId}/sequences?api_key=${encodeURIComponent(apiKey)}`

// The exact save endpoint captured from DevTools (POST, camelCase body).
const SAVE_URL = `${SMARTLEAD_BASE}/api/email-campaigns/add-sequence-list-to-campaign`

// ---------------------------------------------------------------------------
// Loose shapes — every field is optional and read tolerantly (snake OR camel).
// ---------------------------------------------------------------------------
type Any = Record<string, unknown>

function preview(value: unknown, max = 600): string {
  let s: string
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    s = String(value)
  }
  return s.length > max ? `${s.slice(0, max)}… (truncated)` : s
}

function pick<T>(o: Any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k] as T
  }
  return undefined
}

/** Dig the sequences array out of whatever envelope either endpoint returns. */
function extractRawSequences(json: unknown): Any[] | null {
  if (Array.isArray(json)) return json as Any[]
  if (!json || typeof json !== 'object') return null
  const obj = json as Any
  if (Array.isArray(obj.sequences)) return obj.sequences as Any[]
  const data = obj.data
  if (Array.isArray(data)) return data as Any[]
  if (data && typeof data === 'object') {
    const d = data as Any
    if (Array.isArray(d.sequences)) return d.sequences as Any[]
  }
  return null
}

interface CamelVariant {
  id: number
  variantLabel: string | null
  subject: string
  emailBody: string
  isDeleted: boolean
}
interface CamelSequence {
  id: number
  seqNumber: number
  seqType: string
  seqDelayDetails: { delayInDays: number }
  seqScheduleType: string
  variantDistributionType: string
  seqVariants: CamelVariant[]
}

/**
 * Normalize one raw sequence (snake_case v1, or the internal shape which nests
 * variants under `sequence_variants`) into the EXACT camelCase payload the
 * add-sequence-list-to-campaign endpoint expects — nothing more, so no stale
 * keys ride along on save. HTML, {{variables}} and {spintax} pass through
 * verbatim as plain strings.
 */
function toCamelSequence(raw: Any): CamelSequence {
  const delaySrc = (pick<Any>(raw, 'seqDelayDetails', 'seq_delay_details') ?? {}) as Any
  // Variants live under different keys depending on the source endpoint:
  //   internal → `sequence_variants`, v1 → `seq_variants`, save shape → `seqVariants`.
  const variantsSrc = (pick<Any[]>(
    raw,
    'seqVariants',
    'sequence_variants',
    'seq_variants',
  ) ?? []) as Any[]
  return {
    id: Number(pick<number>(raw, 'id') ?? 0),
    seqNumber: Number(pick<number>(raw, 'seqNumber', 'seq_number') ?? 0),
    seqType: String(pick<string>(raw, 'seqType', 'seq_type') ?? 'EMAIL'),
    seqDelayDetails: {
      delayInDays: Number(pick<number>(delaySrc, 'delayInDays', 'delay_in_days') ?? 0),
    },
    seqScheduleType: String(
      pick<string>(raw, 'seqScheduleType', 'seq_schedule_type') ?? 'AUTOMATIC',
    ),
    variantDistributionType: String(
      pick<string>(raw, 'variantDistributionType', 'variant_distribution_type') ??
        'MANUAL_EQUAL',
    ),
    seqVariants: variantsSrc.map((v) => {
      const label = pick<string>(v, 'variantLabel', 'variant_label')
      return {
        id: Number(pick<number>(v, 'id') ?? 0),
        variantLabel: label != null && String(label).trim() ? String(label) : null,
        subject: String(pick<string>(v, 'subject') ?? ''),
        emailBody: String(pick<string>(v, 'emailBody', 'email_body') ?? ''),
        isDeleted: pick<boolean>(v, 'isDeleted', 'is_deleted') === true,
      }
    }),
  }
}

interface ReadResult {
  sequences: CamelSequence[] | null
  /** Diagnostics when nothing usable came back. */
  debug: string[]
}

/**
 * Read the latest sequences, trying the internal endpoint then the v1 endpoint,
 * and return the first that yields a non-empty list (normalized to camelCase).
 */
async function readSequences(
  jwt: string,
  apiKey: string,
  campaignId: number,
): Promise<ReadResult> {
  const debug: string[] = []
  let firstNonEmpty: CamelSequence[] | null = null

  const attempts: { label: string; run: () => Promise<Response> }[] = []
  if (jwt) {
    attempts.push({
      label: 'internal',
      run: () =>
        fetch(internalListUrl(campaignId), {
          headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        }),
    })
  }
  if (apiKey) {
    attempts.push({ label: 'v1', run: () => fetch(v1ListUrl(campaignId, apiKey)) })
  }

  for (const attempt of attempts) {
    try {
      const res = await attempt.run()
      const text = await res.text()
      if (res.status < 200 || res.status >= 300) {
        debug.push(`${attempt.label}: HTTP ${res.status} ${preview(text, 160)}`)
        continue
      }
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        debug.push(`${attempt.label}: non-JSON ${preview(text, 160)}`)
        continue
      }
      const rows = extractRawSequences(json)
      if (!rows) {
        debug.push(`${attempt.label}: no sequences array in ${preview(json, 200)}`)
        continue
      }
      const camel = rows.map(toCamelSequence).filter((s) => s.id > 0)
      if (camel.length > 0) return { sequences: camel, debug }
      // Valid but empty — remember it, but keep trying other sources.
      if (firstNonEmpty === null) firstNonEmpty = camel
      debug.push(`${attempt.label}: returned 0 sequences`)
    } catch (e) {
      debug.push(`${attempt.label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { sequences: firstNonEmpty, debug }
}

// GET  /api/campaign-sequence-editor?id=<campaignId>
//        → { campaignId, sequences: [...camelCase...] } (+ _debug when empty)
// POST /api/campaign-sequence-editor
//        { campaignId, sequenceId, variantId?, subject?, emailBody?, enabled?, delayInDays? }
//        → read latest → mutate only the target by ID → POST full payload to
//          add-sequence-list-to-campaign → refetch to verify → { ok, payload }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  const apiKey =
    process.env.SMARTLEAD_API_KEY ||
    (req.headers['x-smartlead-api-key'] as string) ||
    ''

  if (!jwt && !apiKey) {
    return res.status(400).json({
      error:
        'No Smartlead credentials configured. Set SMARTLEAD_JWT (and optionally SMARTLEAD_API_KEY) in Vercel → Settings → Environment Variables.',
    })
  }

  // ---- Read ---------------------------------------------------------------
  if (req.method === 'GET') {
    const id = Number(req.query.id)
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Provide a numeric ?id=<campaignId>.' })
    }
    try {
      const { sequences, debug } = await readSequences(jwt, apiKey, id)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.status(200).json({
        campaignId: id,
        sequences: sequences ?? [],
        ...(sequences && sequences.length > 0 ? {} : { _debug: debug }),
      })
    } catch (e) {
      return res.status(502).json({
        error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  // ---- Save: read → modify only the target → write → verify --------------
  if (req.method === 'POST') {
    if (!jwt) {
      return res.status(400).json({
        error: 'Saving requires SMARTLEAD_JWT (the add-sequence-list endpoint is JWT-based).',
      })
    }
    const body = (req.body ?? {}) as Any
    const campaignId = Number(body.campaignId)
    const sequenceId = Number(body.sequenceId)
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ error: 'Body must include a numeric "campaignId".' })
    }
    if (!Number.isFinite(sequenceId) || sequenceId <= 0) {
      return res.status(400).json({ error: 'Body must include a numeric "sequenceId".' })
    }

    const variantId = Number(body.variantId)
    const hasVariant = Number.isFinite(variantId) && variantId > 0
    const hasSubject = typeof body.subject === 'string'
    const hasEmailBody = typeof body.emailBody === 'string'
    const hasEnabled = typeof body.enabled === 'boolean'
    const hasDelay = body.delayInDays != null && Number.isFinite(Number(body.delayInDays))

    if (!hasSubject && !hasEmailBody && !hasEnabled && !hasDelay) {
      return res.status(400).json({
        error: 'Nothing to update. Provide subject, emailBody, enabled, and/or delayInDays.',
      })
    }
    if ((hasSubject || hasEmailBody || hasEnabled) && !hasVariant) {
      return res.status(400).json({
        error: 'Editing subject/emailBody/enabled requires a numeric "variantId".',
      })
    }

    try {
      // 1) Fetch the LATEST sequence payload (normalized to camelCase).
      const { sequences, debug } = await readSequences(jwt, apiKey, campaignId)
      if (!sequences || sequences.length === 0) {
        return res.status(502).json({
          error: `Could not load the current sequences before saving. Tried: ${debug.join(' | ')}`,
        })
      }

      // 2) Locate the target sequence by ID (never by index).
      const seq = sequences.find((s) => s.id === sequenceId)
      if (!seq) {
        return res.status(404).json({
          error: `Sequence ${sequenceId} was not found in campaign ${campaignId}.`,
        })
      }

      // 3) Apply ONLY the requested change to ONLY the matched target.
      if (hasDelay) {
        seq.seqDelayDetails = {
          ...seq.seqDelayDetails,
          delayInDays: Math.max(0, Math.round(Number(body.delayInDays))),
        }
      }
      if (hasVariant) {
        const variant = seq.seqVariants.find((v) => v.id === variantId)
        if (!variant) {
          return res.status(404).json({
            error: `Variant ${variantId} was not found in sequence ${sequenceId}.`,
          })
        }
        if (hasSubject) variant.subject = String(body.subject)
        if (hasEmailBody) variant.emailBody = String(body.emailBody)
        // enabled:true → isDeleted:false, enabled:false → isDeleted:true
        if (hasEnabled) variant.isDeleted = !(body.enabled as boolean)
      }

      // 4) Submit the FULL payload back in Smartlead's exact save shape.
      const saveRes = await fetch(SAVE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ campaignId, sequences }),
      })
      const saveText = await saveRes.text()
      if (saveRes.status < 200 || saveRes.status >= 300) {
        return res.status(saveRes.status).json({
          error: `Smartlead rejected the save. Response: ${preview(saveText)}`,
        })
      }
      try {
        const sj = JSON.parse(saveText) as Any
        if (sj?.error || sj?.ok === false) {
          return res
            .status(502)
            .json({ error: `Smartlead rejected the save: ${preview(sj)}` })
        }
      } catch {
        // Non-JSON 2xx is fine — Smartlead sometimes replies with a bare string.
      }

      // 5) Refetch to VERIFY and return the fresh, saved truth.
      const verify = await readSequences(jwt, apiKey, campaignId)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.status(200).json({
        ok: true,
        payload: { campaignId, sequences: verify.sequences ?? sequences },
      })
    } catch (e) {
      return res.status(502).json({
        error: `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' })
}
