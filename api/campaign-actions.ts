import type { VercelRequest, VercelResponse } from '@vercel/node'

import sequenceEditorHandler from '../server/campaign-handlers/sequence-editor.js'
import sequencesHandler from '../server/campaign-handlers/sequences.js'
import statusHandler from '../server/campaign-handlers/status.js'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

const handlers: Record<string, Handler> = {
  'sequence-editor': sequenceEditorHandler,
  sequences: sequencesHandler,
  status: statusHandler,
}

// Several stable public API paths are rewritten here so Vercel deploys one
// function instead of one function per campaign action. This keeps Hobby-plan
// deployments below the function limit without changing callers.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawAction = req.query.action
  const action = Array.isArray(rawAction) ? rawAction[0] : rawAction
  const actionHandler = action ? handlers[action] : undefined

  if (!actionHandler) {
    return res.status(404).json({ error: 'Unknown campaign action.' })
  }

  return actionHandler(req, res)
}
