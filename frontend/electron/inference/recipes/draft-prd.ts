// draft_prd recipe — wraps buildDraftArtifact from tasks.ts with
// artifactType 'PRD'. The underlying helper builds the prompt + source
// list deterministically so the renderer can stream the actual body
// over `ai:stream`, running on the on-device Bonsai-8B model.

import { buildDraftArtifact } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

export const draftPRDRecipe: RecipeDefinition = {
  id: 'draft_prd',
  name: 'Draft PRD',
  description:
    'Draft a product requirements document — goal, requirements, success metrics, risks — from a work thread, with source pins for human review.',
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
        reason: 'draft_prd: thread is empty; refusing to draft a PRD.',
      };
    }
    const resp = buildDraftArtifact(router, {
      threadId: context.threadId ?? '',
      messages: context.messages,
      artifactType: 'PRD',
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
