import { describe, expect, it } from 'vitest'
import type { Campaign, EmailAccount } from '../types'
import { buildBulkSyncSelection } from './bulkSync'

function campaign(id: number, status: string, tags: string[]): Campaign {
  return {
    campaignId: id,
    campaignName: `Campaign ${id}`,
    nameMissing: false,
    createdAt: null,
    apiTags: tags,
    sentCount: 0,
    replyCount: 0,
    oooReplyCount: 0,
    bounceCount: 0,
    totalCount: 0,
    draftedCount: 0,
    status,
    maxLeadsPerDay: null,
    leadStats: {
      total: 0,
      completed: 0,
      inprogress: 0,
      interested: 0,
      notStarted: 0,
      paused: 0,
      blocked: 0,
      stopped: 0,
      senderBounced: 0,
    },
    overview: null,
    generalSettings: null,
  }
}

function account(id: number, tag: string): EmailAccount {
  return {
    id,
    fromEmail: `sender-${id}@example.com`,
    fromName: `Sender ${id}`,
    providerType: 'GMAIL',
    createdAt: null,
    messagePerDay: 25,
    dailySentCount: 0,
    warmupStatus: 'ACTIVE',
    warmupReputation: 98,
    minTimeBtwnEmails: 15,
    warmupPerDay: 9,
    warmupSentCount: null,
    errorMessage: '',
    connected: true,
    isInUse: true,
    dnsSpfVerified: true,
    dnsDkimVerified: true,
    dnsDmarcVerified: true,
    dnsLastVerifiedAt: null,
    tagIds: [1],
    tagNames: [tag],
  }
}

describe('bulk sync campaign selection', () => {
  it('considers campaigns of every status, not only Active', () => {
    const campaigns = [
      campaign(1, 'ACTIVE', ['Pool A']),
      campaign(2, 'PAUSED', ['Pool A']),
      campaign(3, 'COMPLETED', ['Pool A']),
      campaign(4, 'DRAFTED', ['Pool A']),
    ]
    const accounts = [account(101, 'Pool A')]

    const selection = buildBulkSyncSelection(campaigns, accounts)

    expect(selection.totalCampaigns).toBe(4)
    expect(selection.plan.campaigns.map((c) => c.campaignId).sort()).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('still skips a campaign with no matching or ambiguous tag, regardless of status', () => {
    const campaigns = [
      campaign(1, 'PAUSED', ['No Match']),
      campaign(2, 'COMPLETED', []),
    ]
    const accounts = [account(101, 'Pool A')]

    const selection = buildBulkSyncSelection(campaigns, accounts)

    expect(selection.plan.campaigns).toHaveLength(0)
    expect(selection.skipped.noMatchingTag).toBe(2)
  })
})
