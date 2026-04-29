import { describe, expect, it } from 'vitest';
import { draftProposalRecipe } from '../draft-proposal.js';
import { InferenceRouter } from '../../router.js';
import { MockAdapter } from '../../mock.js';

describe('draft_proposal recipe', () => {
  it('declares the correct registry metadata', () => {
    expect(draftProposalRecipe.id).toBe('draft_proposal');
    expect(draftProposalRecipe.name).toMatch(/proposal/i);
    expect(draftProposalRecipe.taskType).toBe('draft_artifact');
    expect(draftProposalRecipe.preferredTier).toBe('local');
  });

  it('returns an ok result with prompt + sources for a normal thread', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const messages = [
      {
        id: 'm_1',
        channelId: 'ch_sales',
        senderId: 'user_alice',
        content: 'Customer asked for a one-page proposal covering scope and price.',
      },
      {
        id: 'm_2',
        channelId: 'ch_sales',
        senderId: 'user_bob',
        content: 'Budget cap is $40k; we should highlight risk on data migration.',
      },
    ];
    const result = await draftProposalRecipe.execute(router, {
      aiEmployeeId: 'ai_mika_drafts',
      channelId: 'ch_sales',
      threadId: 'thr_proposal',
      messages,
    });
    expect(result.status).toBe('ok');
    const output = result.output as {
      prompt: string;
      sources: unknown[];
      threadId: string;
      channelId: string;
    };
    expect(output.prompt).toMatch(/proposal/i);
    expect(output.sources).toHaveLength(2);
    expect(output.threadId).toBe('thr_proposal');
    expect(output.channelId).toBe('ch_sales');
    expect(result.model).toBeTruthy();
  });

  it('refuses gracefully when the thread has no messages', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const result = await draftProposalRecipe.execute(router, {
      aiEmployeeId: 'ai_mika_drafts',
      channelId: 'ch_sales',
      threadId: 'thr_empty',
      messages: [],
    });
    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/empty/i);
  });
});
