import type { VercelRequest, VercelResponse } from '@vercel/node'

// Smartlead's internal Hasura GraphQL endpoint (same JWT as the other proxies).
const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'

// Mirrors the getCampaignInboxById query Smartlead's own Inbox tab fires: one
// page of replied leads for a campaign, newest reply first. seq/variant filters
// narrow it to a single sequence step + A/B variant.
const INBOX_QUERY = `query getCampaignInboxById($offset: Int!, $limit: Int!, $where: email_campaign_stats_bool_exp!) {
  email_campaign_stats(
    where: $where
    order_by: {reply_time: desc, sent_time: desc}
    offset: $offset
    limit: $limit
  ) {
    ...CampaignStatusFragment
    __typename
  }
}

fragment CampaignStatusFragment on email_campaign_stats {
  id
  is_opened
  is_sent
  is_clicked
  got_reply
  is_bounced
  open_time
  sent_time
  click_time
  reply_time
  click_details
  reply_message_details
  email_details
  custom_subject
  custom_email_message
  __typename
}`

/**
 * Best-effort user id from the Hasura JWT. The Inbox query scopes by user_id;
 * Hasura row permissions already scope by the token, so this is belt-and-braces
 * and simply omitted when the claim can't be read.
 */
function userIdFromJwt(jwt: string): number | null {
  try {
    const seg = jwt.split('.')[1]
    if (!seg) return null
    const json = Buffer.from(seg, 'base64').toString('utf8')
    const payload = JSON.parse(json) as Record<string, unknown>
    const claims =
      (payload['https://hasura.io/jwt/claims'] as Record<string, unknown>) ?? {}
    const raw =
      claims['x-hasura-user-id'] ??
      payload.user_id ??
      payload.id ??
      payload.sub
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

// POST /api/campaign-inbox { campaignId, offset?, limit?, seqId?, variantId? }
//   → one page of replies for a campaign (optionally a single sequence variant)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const campaignId = Number(body.campaignId)
  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    return res.status(400).json({ error: 'Body must include a numeric "campaignId".' })
  }

  const offset = Math.max(0, Number(body.offset) || 0)
  const rawLimit = Number(body.limit)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20
  const variantId = Number(body.variantId)
  const seqId = Number(body.seqId)

  const where: Record<string, unknown> = {
    email_campaign_id: { _eq: campaignId },
    sent_time: { _is_null: false },
    got_reply: { _eq: true },
  }
  if (Number.isFinite(seqId) && seqId > 0) {
    where.email_campaign_seq_id = { _eq: seqId }
  }
  if (Number.isFinite(variantId) && variantId > 0) {
    where.seq_variant_id = { _eq: variantId }
  }
  const userId = userIdFromJwt(jwt)
  if (userId) where.user_id = { _eq: userId }

  try {
    const upstream = await fetch(GQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        operationName: 'getCampaignInboxById',
        variables: { offset, limit, where },
        query: INBOX_QUERY,
      }),
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', 'application/json; charset=utf-8')
    return res.send(text)
  } catch (e) {
    res.status(502).json({
      error: `Proxy failed: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
