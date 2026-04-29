// prefill_approval recipe — wraps runPrefillApproval from tasks.ts.
// The underlying helper runs a single on-device inference, parses
// vendor / amount / justification / risk fields, and collects source
// provenance per field so the renderer can pin every field to the
// messages that justified it before a human confirms.

import { runPrefillApproval } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

export const prefillApprovalRecipe: RecipeDefinition = {
  id: 'prefill_approval',
  name: 'Prefill approval',
  description:
    'Prefill a draft approval card (vendor, amount, justification, risk) from a work thread, with per-field source pins so a human can confirm before anything is written.',
  taskType: 'prefill_approval',
  preferredTier: 'local',
  async execute(
    router: InferenceRouter,
    context: RecipeContext,
  ): Promise<RecipeResult> {
    if (context.messages.length === 0) {
      return {
        status: 'refused',
        output: {
          fields: {},
          sourceMessageIds: [],
          threadId: context.threadId ?? '',
          channelId: context.channelId,
        },
        model: '',
        tier: 'local',
        reason: 'prefill_approval: thread is empty; refusing to prefill approval.',
      };
    }
    const resp = await runPrefillApproval(router, {
      threadId: context.threadId ?? '',
      messages: context.messages,
    });
    return {
      status: 'ok',
      output: {
        vendor: resp.fields.vendor,
        amount: resp.fields.amount,
        risk: resp.fields.risk,
        justification: resp.fields.justification,
        fields: resp.fields,
        sourceMessageIds: resp.sourceMessageIds,
        templateId: resp.templateId,
        title: resp.title,
        threadId: resp.threadId,
        channelId: resp.channelId,
      },
      model: resp.model,
      tier: resp.tier,
      reason: resp.reason,
    };
  },
};
