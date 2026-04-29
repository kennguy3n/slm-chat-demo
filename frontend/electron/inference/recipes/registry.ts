// Recipe Registry — Phase 4. Recipes are higher-level, AI-Employee-
// scoped wrappers around the existing inference task helpers
// (`tasks.ts`, `secondBrain.ts`). They are intentionally *separate*
// from the AI Skills Framework (`skill-framework.ts`):
//
//   • Skills are low-level inference contracts that own prompt
//     construction, guardrails, and output parsing.
//   • Recipes are an AI-Employee-facing abstraction — each one composes
//     an existing task helper, binds the AI Employee's context, and
//     returns a uniform `RecipeResult` the renderer can display.
//
// The renderer dispatches recipes through the generic `ai:recipe:run`
// IPC channel; the IPC handler looks the recipe up by ID and calls
// `execute`.

import type { TaskType, Tier } from '../adapter.js';
import type { InferenceRouter } from '../router.js';

// RecipeMessage is the minimum shape a recipe needs to reason about a
// thread. It matches the renderer's `Message` shape reduced to the
// fields existing inference helpers consume.
export interface RecipeMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
}

// RecipeContext is the execution context the renderer forwards over
// the IPC bridge. Every recipe receives the active AI Employee id so
// it can record provenance + enforce per-employee quotas.
export interface RecipeContext {
  channelId: string;
  threadId?: string;
  messages: RecipeMessage[];
  aiEmployeeId: string;
}

// RecipeResult is the uniform envelope recipes return. The shape
// intentionally mirrors the existing "allow / refuse" pattern from
// ARCHITECTURE.md §4 (model refusals are first-class, not exceptions).
export interface RecipeResult {
  status: 'ok' | 'refused';
  output: unknown;
  model: string;
  tier: Tier;
  reason: string;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  description: string;
  taskType: TaskType;
  preferredTier: Tier;
  execute: (
    router: InferenceRouter,
    context: RecipeContext,
  ) => Promise<RecipeResult>;
}

// Module-level registry. Recipes self-register at import time via
// `registerRecipe`; the barrel `index.ts` is responsible for pulling
// in every recipe file.
export const RECIPE_REGISTRY: Map<string, RecipeDefinition> = new Map();

export function registerRecipe(def: RecipeDefinition): void {
  RECIPE_REGISTRY.set(def.id, def);
}

export function getRecipe(id: string): RecipeDefinition | undefined {
  return RECIPE_REGISTRY.get(id);
}

export function listRecipes(): RecipeDefinition[] {
  return Array.from(RECIPE_REGISTRY.values());
}
