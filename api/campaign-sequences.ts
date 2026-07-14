import type { VercelRequest, VercelResponse } from '@vercel/node'

// Smartlead's internal Hasura GraphQL endpoint (same JWT as the other proxies).
const GQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql'

const SEQUENCE_QUERY = `query getCampaignSequenceAnalyticsById($args: grouped_email_campaign_stats_args!) {
  grouped_email_campaign_stats(
    args: $args
    order_by: {email_campaign_seq_mapping: {seq_number: asc}}
  ) {
    id
    email_campaign_id
    sent_count
    bounce_count
    open_count
    click_count
    reply_count
    unsubscribed_count
    sender_bounce_count
    skipped_count
    seq_number
    variant_label
    seq_variant_id
    positive_reply_count
    email_campaign_seq_mapping {
      id
    }
    __typename
  }
}`

// GET /api/campaign-sequences?id=123 → per-sequence/variant analytics for one campaign
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jwt =
    process.env.SMARTLEAD_JWT || (req.headers['x-smartlead-jwt'] as string) || ''
  if (!jwt) {
    return res.status(400).json({
      error:
        'No Smartlead JWT configured. Set SMARTLEAD_JWT in Vercel → Settings → Environment Variables.',
    })
  }

  const id = Number(req.query.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Provide a numeric ?id=<campaignId>.' })
  }

  try {
    const upstream = await fetch(GQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        operationName: 'getCampaignSequenceAnalyticsById',
        variables: { args: { campaign_id: id } },
        query: SEQUENCE_QUERY,
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
