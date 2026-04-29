// draft_proposal recipe — wraps buildDraftArtifact from tasks.ts with
// artifactType 'Proposal'. Same deterministic prompt-then-stream
// pattern as draft_prd; the renderer streams the body via `ai:stream`
// using the returned prompt + source list so inference runs once.

import { buildDraftArtifact } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

export const draftProposalRecipe: RecipeDefinition = {
  id: 'draft_proposal',
  name: 'Draft proposal',
  description:
    'Draft a sales / vendor proposal — summary, scope, cost, risks, ask — from a work thread, with source pins for human review.',
  taskType: 'draft_artifact',
  preferredTier: 'e4b',
  async execute(
    router: InferenceRouter,
    context: RecipeContext,
  ): Promise<RecipeResult> {
    if (context.messages.length === 0) {
      return {
        status: 'refused',
        output: { prompt: '', sources: [], threadId: context.threadId ?? '', channelId: context.channelId },
        model: '',
        tier: 'e4b',
        reason: 'draft_proposal: thread is empty; refusing to draft a proposal.',
      };
    }
    const resp = buildDraftArtifact(router, {
      threadId: context.threadId ?? '',
      messages: context.messages,
      artifactType: 'Proposal',
    });
    return {
      status: 'ok',
      output: {
        prompt: resp.prompt,
        sources: resp.sources,
        threadId: resp.threadId,
        channelId: resp.channelId,
      },
      model: resp.model,
      tier: resp.tier,
      reason: resp.reason,
    };
  },
};
