import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CampaignSequencePayload,
  EditableSequence,
  EditableVariant,
  SequenceEditRequest,
} from '../types'

type RowStatus = 'idle' | 'saving' | 'saved' | 'error'
interface RowState {
  status: RowStatus
  error?: string
}

interface Props {
  /** Non-null opens the editor for this campaign. */
  campaignId: number | null
  campaignName: string
  onClose: () => void
  fetchEditor: (campaignId: number) => Promise<CampaignSequencePayload>
  saveEdit: (req: SequenceEditRequest) => Promise<CampaignSequencePayload>
}

// ---- Immutable updaters -----------------------------------------------------

function mapSequence(
  payload: CampaignSequencePayload,
  sequenceId: number,
  fn: (s: EditableSequence) => EditableSequence,
): CampaignSequencePayload {
  return {
    ...payload,
    sequences: payload.sequences.map((s) => (s.id === sequenceId ? fn(s) : s)),
  }
}

function mapVariant(
  payload: CampaignSequencePayload,
  sequenceId: number,
  variantId: number,
  fn: (v: EditableVariant) => EditableVariant,
): CampaignSequencePayload {
  return mapSequence(payload, sequenceId, (s) => ({
    ...s,
    variants: s.variants.map((v) => (v.id === variantId ? fn(v) : v)),
  }))
}

function findVariant(
  payload: CampaignSequencePayload | null,
  sequenceId: number,
  variantId: number,
): EditableVariant | undefined {
  return payload?.sequences
    .find((s) => s.id === sequenceId)
    ?.variants.find((v) => v.id === variantId)
}

// ---- Small UI pieces --------------------------------------------------------

/**
 * Render the email body exactly as authored (variables and spintax shown
 * literally) inside a fully sandboxed iframe — no scripts, no parent access.
 */
function BodyPreview({ html }: { html: string }) {
  const body = html.trim()
    ? html
    : `<div style="color:#9aa0a6">(empty body)</div>`
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;background:#fff;padding:14px;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#2563eb}</style></head><body>${body}</body></html>`
  return (
    <iframe
      title="Email preview"
      sandbox=""
      srcDoc={srcDoc}
      className="h-80 w-full rounded-lg border border-line-soft bg-white"
    />
  )
}

// A11y toggle for enable/disable (ON = enabled, OFF = disabled/isDeleted).
function Toggle({
  on,
  busy,
  onToggle,
}: {
  on: boolean
  busy: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onToggle}
      title={on ? 'Enabled — click to disable' : 'Disabled — click to enable'}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
        on ? 'bg-lime/80' : 'bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      >
        {busy && (
          <span className="grid h-full w-full place-items-center text-[8px] text-faint">
            <span className="inline-block animate-spin">↻</span>
          </span>
        )}
      </span>
    </button>
  )
}

function StatusPill({ state }: { state: RowState | undefined }) {
  if (!state || state.status === 'idle') return null
  if (state.status === 'saving')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-faint">
        <span className="inline-block animate-spin">↻</span> Saving…
      </span>
    )
  if (state.status === 'saved')
    return <span className="text-[11px] font-medium text-positive">✓ Saved</span>
  return (
    <span
      className="max-w-[240px] truncate text-[11px] font-medium text-critical"
      title={state.error}
    >
      ! {state.error || 'Save failed'}
    </span>
  )
}

// ---- Variant editor ---------------------------------------------------------

function VariantCard({
  variant,
  serverVariant,
  rowState,
  onToggle,
  onFieldChange,
  onSave,
  onReset,
}: {
  variant: EditableVariant
  serverVariant: EditableVariant | undefined
  rowState: RowState | undefined
  onToggle: () => void
  onFieldChange: (field: 'subject' | 'emailBody', value: string) => void
  onSave: () => void
  onReset: () => void
}) {
  const [showPreview, setShowPreview] = useState(false)
  const enabled = !variant.isDeleted
  const dirty =
    serverVariant != null &&
    (variant.subject !== serverVariant.subject ||
      variant.emailBody !== serverVariant.emailBody)
  const saving = rowState?.status === 'saving'

  return (
    <div
      className={`rounded-xl border transition ${
        enabled ? 'border-line bg-white/[0.015]' : 'border-line-soft bg-white/[0.008] opacity-70'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`grid h-6 w-6 place-items-center rounded-md border text-[11px] font-bold ${
              enabled
                ? 'border-lime/40 bg-lime/10 text-lime'
                : 'border-line text-faint'
            }`}
          >
            {variant.variantLabel || '–'}
          </span>
          <span className="text-[12px] font-medium text-muted">
            Variant {variant.variantLabel || '(single)'}
          </span>
          {dirty && (
            <span className="rounded-md bg-warn/10 px-1.5 py-px text-[10px] font-semibold text-warn">
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] font-medium ${enabled ? 'text-positive' : 'text-faint'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <Toggle on={enabled} busy={saving} onToggle={onToggle} />
        </div>
      </div>

      <div className="space-y-2.5 border-t border-line-soft px-3.5 py-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
            Subject
          </span>
          <input
            value={variant.subject}
            onChange={(e) => onFieldChange('subject', e.target.value)}
            placeholder="(no subject — inherits the thread)"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-base px-3 py-2 text-[13px] text-ink outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/25 placeholder:text-faint/50"
          />
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              Email body (HTML)
            </span>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="text-[11px] font-medium text-faint transition hover:text-lime"
            >
              {showPreview ? 'Edit source' : 'Preview'}
            </button>
          </div>
          {showPreview ? (
            <BodyPreview html={variant.emailBody} />
          ) : (
            <textarea
              value={variant.emailBody}
              onChange={(e) => onFieldChange('emailBody', e.target.value)}
              spellCheck={false}
              rows={16}
              className="w-full resize-y rounded-lg border border-line bg-base px-3 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/25"
            />
          )}
          <p className="mt-1 text-[10.5px] text-faint/70">
            Variables like <code className="text-muted">{'{{first_name}}'}</code> and spintax like{' '}
            <code className="text-muted">{'{Hi|Hello}'}</code> are kept exactly as typed.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <StatusPill state={rowState} />
          <div className="ml-auto flex items-center gap-2">
            {dirty && !saving && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-faint transition hover:text-ink"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-lime/40 bg-lime/10 px-3 py-1 text-[12px] font-semibold text-lime transition hover:bg-lime/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-faint"
            >
              {saving && <span className="inline-block animate-spin">↻</span>}
              Save copy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Delay editor -----------------------------------------------------------

function DelayEditor({
  seq,
  serverDelay,
  state,
  onChange,
  onSave,
}: {
  seq: EditableSequence
  serverDelay: number | undefined
  state: RowState | undefined
  onChange: (value: number) => void
  onSave: () => void
}) {
  // Email 1 is the first send — no wait applies before it.
  if (seq.seqNumber <= 1) {
    return <span className="text-[11px] text-faint">Sends first · no delay</span>
  }
  const dirty = serverDelay != null && seq.delayInDays !== serverDelay
  const saving = state?.status === 'saving'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-faint">Wait</span>
      <input
        type="text"
        inputMode="numeric"
        value={String(seq.delayInDays)}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
        aria-label={`Delay in days before email ${seq.seqNumber}`}
        className="tnum h-7 w-14 rounded-lg border border-line bg-base px-2 text-right text-[13px] text-ink outline-none transition focus:border-lime/50 focus:ring-1 focus:ring-lime/25"
      />
      <span className="text-[11px] text-faint">day(s)</span>
      {dirty && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md border border-lime/40 bg-lime/10 px-2 py-0.5 text-[11px] font-semibold text-lime transition hover:bg-lime/20 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
      <StatusPill state={dirty || saving || state?.status === 'error' ? state : undefined} />
    </div>
  )
}

// ---- Main editor ------------------------------------------------------------

export default function SequenceEditor({
  campaignId,
  campaignName,
  onClose,
  fetchEditor,
  saveEdit,
}: Props) {
  const [server, setServer] = useState<CampaignSequencePayload | null>(null)
  const [working, setWorking] = useState<CampaignSequencePayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variantState, setVariantState] = useState<Record<number, RowState>>({})
  const [delayState, setDelayState] = useState<Record<number, RowState>>({})
  const [addingSequence, setAddingSequence] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const reqIdRef = useRef(0)
  const serverRef = useRef<CampaignSequencePayload | null>(null)
  useEffect(() => {
    serverRef.current = server
  }, [server])

  const load = useCallback(
    async (id: number) => {
      const reqId = ++reqIdRef.current
      setLoading(true)
      setError(null)
      setVariantState({})
      setDelayState({})
      try {
        const payload = await fetchEditor(id)
        if (reqId !== reqIdRef.current) return
        setServer(payload)
        setWorking(payload)
      } catch (e) {
        if (reqId !== reqIdRef.current) return
        setError(e instanceof Error ? e.message : String(e))
        setServer(null)
        setWorking(null)
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    },
    [fetchEditor],
  )

  useEffect(() => {
    if (campaignId == null) return
    void load(campaignId)
  }, [campaignId, load])

  // True when any variant copy or delay differs from the server truth.
  const hasUnsaved = useMemo(() => {
    if (!server || !working) return false
    for (const s of working.sequences) {
      const ss = server.sequences.find((x) => x.id === s.id)
      if (!ss) continue
      if (s.delayInDays !== ss.delayInDays) return true
      for (const v of s.variants) {
        const sv = ss.variants.find((x) => x.id === v.id)
        if (!sv) continue
        if (v.subject !== sv.subject || v.emailBody !== sv.emailBody) return true
      }
    }
    return false
  }, [server, working])

  const requestClose = useCallback(() => {
    if (
      hasUnsaved &&
      !window.confirm('You have unsaved copy edits. Close and discard them?')
    ) {
      return
    }
    onClose()
  }, [hasUnsaved, onClose])

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (campaignId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [campaignId, requestClose])

  // Reconcile a saved payload into both server truth and the working copy,
  // replacing only the just-saved target so other in-progress edits survive.
  const reconcile = useCallback(
    (fresh: CampaignSequencePayload, sequenceId: number, variantId?: number) => {
      setServer(fresh)
      setWorking((prev) => {
        if (!prev) return fresh
        const freshSeq = fresh.sequences.find((s) => s.id === sequenceId)
        if (!freshSeq) return prev
        if (variantId != null) {
          const freshVar = freshSeq.variants.find((v) => v.id === variantId)
          if (!freshVar) return prev
          return mapVariant(prev, sequenceId, variantId, () => ({ ...freshVar }))
        }
        return mapSequence(prev, sequenceId, (s) => ({
          ...s,
          delayInDays: freshSeq.delayInDays,
        }))
      })
    },
    [],
  )

  const setVar = (id: number, state: RowState) =>
    setVariantState((p) => ({ ...p, [id]: state }))
  const setDelay = (id: number, state: RowState) =>
    setDelayState((p) => ({ ...p, [id]: state }))

  // Toggle enable/disable with optimistic update + rollback on failure.
  const handleToggle = useCallback(
    async (seqId: number, variant: EditableVariant) => {
      if (campaignId == null) return
      const nextEnabled = variant.isDeleted // was disabled → enabling
      setWorking((prev) =>
        prev
          ? mapVariant(prev, seqId, variant.id, (v) => ({ ...v, isDeleted: !nextEnabled }))
          : prev,
      )
      setVar(variant.id, { status: 'saving' })
      try {
        const fresh = await saveEdit({
          campaignId,
          sequenceId: seqId,
          variantId: variant.id,
          enabled: nextEnabled,
        })
        reconcile(fresh, seqId, variant.id)
        setVar(variant.id, { status: 'saved' })
        setTimeout(
          () =>
            setVariantState((p) =>
              p[variant.id]?.status === 'saved' ? { ...p, [variant.id]: { status: 'idle' } } : p,
            ),
          1500,
        )
      } catch (e) {
        // Roll back to the server truth for this variant.
        setWorking((prev) => {
          if (!prev) return prev
          const sv = findVariant(serverRef.current, seqId, variant.id)
          return mapVariant(prev, seqId, variant.id, (v) => ({
            ...v,
            isDeleted: sv ? sv.isDeleted : variant.isDeleted,
          }))
        })
        setVar(variant.id, {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [campaignId, saveEdit, reconcile],
  )

  const handleField = (seqId: number, variantId: number, field: 'subject' | 'emailBody', value: string) => {
    setWorking((prev) =>
      prev ? mapVariant(prev, seqId, variantId, (v) => ({ ...v, [field]: value })) : prev,
    )
    // Clear a stale saved/error pill once the user resumes typing.
    setVariantState((p) =>
      p[variantId] && p[variantId].status !== 'saving'
        ? { ...p, [variantId]: { status: 'idle' } }
        : p,
    )
  }

  const handleResetVariant = (seqId: number, variantId: number) => {
    const sv = findVariant(server, seqId, variantId)
    if (!sv) return
    setWorking((prev) =>
      prev ? mapVariant(prev, seqId, variantId, () => ({ ...sv })) : prev,
    )
    setVar(variantId, { status: 'idle' })
  }

  const handleSaveVariant = useCallback(
    async (seqId: number, variant: EditableVariant) => {
      if (campaignId == null) return
      setVar(variant.id, { status: 'saving' })
      try {
        const fresh = await saveEdit({
          campaignId,
          sequenceId: seqId,
          variantId: variant.id,
          subject: variant.subject,
          emailBody: variant.emailBody,
        })
        reconcile(fresh, seqId, variant.id)
        setVar(variant.id, { status: 'saved' })
        setTimeout(
          () =>
            setVariantState((p) =>
              p[variant.id]?.status === 'saved' ? { ...p, [variant.id]: { status: 'idle' } } : p,
            ),
          2000,
        )
      } catch (e) {
        setVar(variant.id, {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [campaignId, saveEdit, reconcile],
  )

  // Append a brand-new (empty) sequence step. The server assigns the real id;
  // only the new step is merged in so other in-progress edits survive.
  const handleAddSequence = useCallback(async () => {
    if (campaignId == null) return
    setAddingSequence(true)
    setAddError(null)
    try {
      const fresh = await saveEdit({ campaignId, addSequence: true })
      setServer(fresh)
      setWorking((prev) => {
        if (!prev) return fresh
        const knownIds = new Set(prev.sequences.map((s) => s.id))
        const added = fresh.sequences.filter((s) => !knownIds.has(s.id))
        return { ...prev, sequences: [...prev.sequences, ...added] }
      })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    } finally {
      setAddingSequence(false)
    }
  }, [campaignId, saveEdit])

  const handleDelayChange = (seqId: number, value: number) => {
    setWorking((prev) =>
      prev ? mapSequence(prev, seqId, (s) => ({ ...s, delayInDays: value })) : prev,
    )
    setDelayState((p) =>
      p[seqId] && p[seqId].status !== 'saving' ? { ...p, [seqId]: { status: 'idle' } } : p,
    )
  }

  const handleSaveDelay = useCallback(
    async (seq: EditableSequence) => {
      if (campaignId == null) return
      setDelay(seq.id, { status: 'saving' })
      try {
        const fresh = await saveEdit({
          campaignId,
          sequenceId: seq.id,
          delayInDays: seq.delayInDays,
        })
        reconcile(fresh, seq.id)
        setDelay(seq.id, { status: 'saved' })
        setTimeout(
          () =>
            setDelayState((p) =>
              p[seq.id]?.status === 'saved' ? { ...p, [seq.id]: { status: 'idle' } } : p,
            ),
          2000,
        )
      } catch (e) {
        setDelay(seq.id, {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [campaignId, saveEdit, reconcile],
  )

  if (campaignId == null) return null

  const sequences = working?.sequences ?? []

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={requestClose} />

      <div className="relative flex h-full max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lime/80">
              <span className="h-[14px] w-[3px] rounded-full bg-gradient-to-b from-lime to-lime/30" />
              Sequence Manager
            </div>
            <h2
              className="mt-1 truncate font-display text-[16px] font-semibold tracking-[-0.02em] text-ink"
              title={`${campaignName} · #${campaignId}`}
            >
              {campaignName}
            </h2>
            <div className="mt-0.5 text-[11px] text-faint">
              {loading
                ? 'Loading sequences…'
                : `${sequences.length} sequence step${sequences.length === 1 ? '' : 's'} · toggle, edit copy & delays`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => campaignId != null && load(campaignId)}
              disabled={loading}
              title="Reload from Smartlead"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint transition hover:text-ink disabled:opacity-50"
            >
              <span className={loading ? 'inline-block animate-spin' : ''}>↻</span>
            </button>
            <button
              onClick={requestClose}
              aria-label="Close sequence manager"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint transition hover:bg-white/[0.04] hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-5">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-48 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
              <div className="font-semibold">Couldn’t load sequences.</div>
              <div className="mt-1 break-words text-critical/80">{error}</div>
              <button
                onClick={() => campaignId != null && load(campaignId)}
                className="mt-2 rounded-lg border border-critical/40 px-3 py-1 text-xs font-semibold text-critical transition hover:bg-critical/10"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && sequences.length === 0 && (
            <div className="grid place-items-center px-4 py-20 text-center">
              <div className="text-3xl opacity-30">✉</div>
              <div className="mt-2 text-sm text-faint">
                This campaign has no email sequences.
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            sequences.map((seq) => {
              const serverSeq = server?.sequences.find((s) => s.id === seq.id)
              const activeVariants = seq.variants.filter((v) => !v.isDeleted).length
              return (
                <section
                  key={seq.id}
                  className="overflow-hidden rounded-2xl border border-line bg-panel-2/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 place-items-center rounded-lg border border-lime/30 bg-lime/10 text-[12px] font-bold text-lime">
                        {seq.seqNumber}
                      </span>
                      <div>
                        <div className="text-[13px] font-semibold text-ink">
                          Email {seq.seqNumber}
                        </div>
                        <div className="text-[10.5px] text-faint">
                          {seq.variants.length} variant{seq.variants.length === 1 ? '' : 's'} ·{' '}
                          {activeVariants} active
                        </div>
                      </div>
                    </div>
                    <DelayEditor
                      seq={seq}
                      serverDelay={serverSeq?.delayInDays}
                      state={delayState[seq.id]}
                      onChange={(v) => handleDelayChange(seq.id, v)}
                      onSave={() => handleSaveDelay(seq)}
                    />
                  </div>

                  <div className="space-y-2.5 p-3 sm:p-3.5">
                    {seq.variants.map((variant) => (
                      <VariantCard
                        key={variant.id}
                        variant={variant}
                        serverVariant={serverSeq?.variants.find((v) => v.id === variant.id)}
                        rowState={variantState[variant.id]}
                        onToggle={() => handleToggle(seq.id, variant)}
                        onFieldChange={(field, value) =>
                          handleField(seq.id, variant.id, field, value)
                        }
                        onSave={() => handleSaveVariant(seq.id, variant)}
                        onReset={() => handleResetVariant(seq.id, variant.id)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}

          {!loading && !error && (
            <div>
              <button
                type="button"
                onClick={handleAddSequence}
                disabled={addingSequence}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-[13px] font-semibold text-faint transition hover:border-lime/40 hover:text-lime disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addingSequence ? (
                  <>
                    <span className="inline-block animate-spin">↻</span> Adding sequence…
                  </>
                ) : (
                  <>+ Add sequence</>
                )}
              </button>
              {addError && (
                <p className="mt-1.5 text-[11px] font-medium text-critical">{addError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
