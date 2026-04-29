import { describe, expect, it } from 'vitest';
import { prefillApprovalRecipe } from '../prefill-approval.js';
import { InferenceRouter } from '../../router.js';
import { MockAdapter } from '../../mock.js';

describe('prefill_approval recipe', () => {
  it('declares the correct registry metadata', () => {
    expect(prefillApprovalRecipe.id).toBe('prefill_approval');
    expect(prefillApprovalRecipe.name).toMatch(/approval/i);
    expect(prefillApprovalRecipe.taskType).toBe('prefill_approval');
    expect(prefillApprovalRecipe.preferredTier).toBe('e4b');
  });

  it('returns an ok result with prefilled fields for a normal thread', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter, adapter, {
      hasRealE4B: true,
    });
    const messages = [
      {
        id: 'm_1',
        channelId: 'ch_ops',
        senderId: 'user_alice',
        content: 'Acme Logs renewal is due; budget is $42,000 per year.',
      },
      {
        id: 'm_2',
        channelId: 'ch_ops',
        senderId: 'user_bob',
        content: 'Risk is low — we already vetted them last year.',
      },
    ];
    const result = await prefillApprovalRecipe.execute(router, {
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_ops',
      threadId: 'thr_approval',
      messages,
    });
    expect(result.status).toBe('ok');
    const output = result.output as {
      vendor?: string;
      amount?: string;
      risk?: string;
      justification?: string;
      sourceMessageIds: string[];
      threadId: string;
      channelId: string;
    };
    // At least one of the four parsed fields should be present — the
    // MockAdapter returns a canned vendor/amount/justification/risk
    // block for `prefill_approval` task type.
    expect(
      output.vendor || output.amount || output.risk || output.justification,
    ).toBeTruthy();
    expect(output.sourceMessageIds.length).toBeGreaterThan(0);
    expect(output.threadId).toBe('thr_approval');
    expect(output.channelId).toBe('ch_ops');
    expect(result.model).toBeTruthy();
  });

  it('refuses gracefully when the thread has no messages', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter, adapter, {
      hasRealE4B: true,
    });
    const result = await prefillApprovalRecipe.execute(router, {
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_ops',
      threadId: 'thr_empty',
      messages: [],
    });
    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/empty/i);
  });
});
