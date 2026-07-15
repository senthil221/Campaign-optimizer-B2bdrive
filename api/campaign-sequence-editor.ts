import type { VercelRequest, VercelResponse } from '@vercel/node'

// Smartlead's internal REST API (same JWT bearer as get-all-campaigns et al.).
const SMARTLEAD_BASE = 'https://server.smartlead.ai'

// GET the editable sequence list for a campaign. This is the same request
// Smartlead's own sequence editor fires when you open a campaign's Sequences tab.
const listUrl = (campaignId: number) =>
  `${SMARTLEAD_BASE}/api/email-campaigns/${campaignId}/sequences`

// The exact save endpoint captured from DevTools when saving/toggling a
// sequence in Smartlead (POST, JSON body { campaignId, sequences: [...] }).
const SAVE_URL = `${SMARTLEAD_BASE}/api/email-campaigns/add-sequence-list-to-campaign`

// ---------------------------------------------------------------------------
// Loose shapes for the bits we mutate. Every other field on a sequence/variant
// is preserved verbatim (we mutate the parsed objects in place), so Smartlead's
// HTML, spintax and variables survive a round-trip untouched.
// ---------------------------------------------------------------------------
interface RawVariant {
  id?: number
  variantLabel?: string
  subject?: string
  emailBody?: string
  isDeleted?: boolean
  [k: string]: unknown
}
interface RawSequence {
  id?: number
  seqNumber?: number
  seqDelayDetails?: { delayInDays?: number } | null
  seqVariants?: RawVariant[]
  [k: string]: unknown
}

function preview(value: unknown, max = 600): string {
  let s: string
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    s = String(value)
  }
  return s.length > max ? `${s.slice(0, max)}… (truncated)` : s
}

/**
 * Dig the sequences array out of whichever envelope Smartlead returns:
 * a bare array, { sequences }, { data: [...] }, or { data: { sequences } }.
 */
function extractSequences(json: unknown): RawSequence[] | null {
  if (Array.isArray(json)) return json as RawSequence[]
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.sequences)) return obj.sequences as RawSequence[]
  const data = obj.data
  if (Array.isArray(data)) return data as RawSequence[]
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.sequences)) return d.sequences as RawSequence[]
  }
  return null
}

async function fetchSequences(
  jwt: string,
  campaignId: number,
): Promise<{ status: number; text: string }> {
  const upstream = await fetch(listUrl(campaignId), {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
  })
  return { status: upstream.status, text: await upstream.text() }
}

// GET  /api/campaign-sequence-editor?id=<campaignId>
//        → the editable sequence payload (pass-through, for the client to render)
// POST /api/campaign-sequence-editor
//        { campaignId, sequenceId, variantId?, subject?, emailBody?, enabled?, delayInDays? }
//        → server-side read-modify-write: fetch latest, mutate only the target
//          sequence/variant by ID, POST the whole payload back, then refetch to
//          verify. Returns { payload } with the fresh, saved sequences.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }

  // ---- Read the current sequence list ------------------------------------
  if (req.method === 'GET') {
    const id = Number(req.query.id)
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Provide a numeric ?id=<campaignId>.' })
    }
    try {
      const { status, text } = await fetchSequences(jwt, id)
      res.status(status)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.send(text)
    } catch (e) {
      return res.status(502).json({
        error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  // ---- Save: read → modify only the target → write → verify --------------
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>
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
      // 1) Fetch the LATEST sequence payload straight from Smartlead.
      const current = await fetchSequences(jwt, campaignId)
      if (current.status < 200 || current.status >= 300) {
        return res.status(current.status).json({
          error: `Could not load the current sequences before saving. Response: ${preview(current.text)}`,
        })
      }
      let currentJson: unknown
      try {
        currentJson = JSON.parse(current.text)
      } catch {
        return res.status(502).json({
          error: `Current sequences response was not JSON. Response: ${preview(current.text)}`,
        })
      }
      const sequences = extractSequences(currentJson)
      if (!sequences) {
        return res.status(502).json({
          error: `Could not find a sequences array in Smartlead's response. Response: ${preview(currentJson)}`,
        })
      }

      // 2) Locate the target sequence by ID (never trust a client-sent index).
      const seq = sequences.find((s) => Number(s?.id) === sequenceId)
      if (!seq) {
        return res.status(404).json({
          error: `Sequence ${sequenceId} was not found in campaign ${campaignId}.`,
        })
      }

      // 3) Apply ONLY the requested change to ONLY the matched target.
      if (hasDelay) {
        const days = Math.max(0, Math.round(Number(body.delayInDays)))
        seq.seqDelayDetails = { ...(seq.seqDelayDetails ?? {}), delayInDays: days }
      }
      if (hasVariant) {
        const variants = Array.isArray(seq.seqVariants) ? seq.seqVariants : []
        const variant = variants.find((v) => Number(v?.id) === variantId)
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
      // Some Smartlead endpoints return 200 with an { error } / { ok:false } body.
      try {
        const sj = JSON.parse(saveText) as Record<string, unknown>
        if (sj?.error || sj?.ok === false) {
          return res
            .status(502)
            .json({ error: `Smartlead rejected the save: ${preview(sj)}` })
        }
      } catch {
        // Non-JSON 2xx is fine — Smartlead sometimes replies with a bare string.
      }

      // 5) Refetch to VERIFY the change persisted, and return the fresh truth.
      const verify = await fetchSequences(jwt, campaignId)
      let payload: unknown = null
      if (verify.status >= 200 && verify.status < 300) {
        try {
          payload = JSON.parse(verify.text)
        } catch {
          payload = null
        }
      }

      res.setHeader('content-type', 'application/json; charset=utf-8')
      return res.status(200).json({ ok: true, payload })
    } catch (e) {
      return res.status(502).json({
        error: `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' })
}
