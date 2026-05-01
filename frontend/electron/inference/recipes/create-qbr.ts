// create_qbr recipe — wraps buildDraftArtifact from tasks.ts with
// artifactType 'QBR'. The helper summarises wins, gaps, asks, and the
// next-quarter plan from a work thread on the on-device
// Bonsai-1.7B model; the renderer streams the body via
// `ai:stream` using the returned prompt + source list.

import { buildDraftArtifact } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

export const createQBRRecipe: RecipeDefinition = {
  id: 'create_qbr',
  name: 'Create QBR',
  description:
    'Draft a quarterly business review — wins, gaps, asks, next-quarter plan — from a work thread, with source pins for human review.',
  taskType: 'draft_artifact',
  preferredTier: 'local',
  async execute(
    router: InferenceRouter,
    context: RecipeContext,
  ): Promise<RecipeResult> {
    if (context.messages.length === 0) {
      return {
        status: 'refused',
        output: { prompt: '', sources: [], threadId: context.threadId ?? '', channelId: context.channelId },
        model: '',
        tier: 'local',
        reason: 'create_qbr: thread is empty; refusing to draft a QBR.',
      };
    }
    const resp = buildDraftArtifact(router, {
      threadId: context.threadId ?? '',
      messages: context.messages,
      artifactType: 'QBR',
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
