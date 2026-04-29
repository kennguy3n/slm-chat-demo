import { beforeEach, describe, expect, it } from 'vitest';
import {
  RECIPE_REGISTRY,
  getRecipe,
  listRecipes,
  registerRecipe,
  type RecipeDefinition,
} from '../registry.js';

function fakeRecipe(id: string): RecipeDefinition {
  return {
    id,
    name: `Fake ${id}`,
    description: 'fake recipe for tests',
    taskType: 'summarize',
    preferredTier: 'local',
    async execute() {
      return {
        status: 'ok',
        output: { id },
        model: 'mock-2b',
        tier: 'local',
        reason: 'test',
      };
    },
  };
}

describe('recipe registry', () => {
  // Snapshot the canonical registry state and restore it so seeded
  // recipes (summarize, extract_tasks) survive per-test mutations.
  const before = new Map(RECIPE_REGISTRY);

  beforeEach(() => {
    RECIPE_REGISTRY.clear();
    for (const [k, v] of before) RECIPE_REGISTRY.set(k, v);
  });

  it('registers and retrieves a recipe by id', () => {
    registerRecipe(fakeRecipe('fake-1'));
    const r = getRecipe('fake-1');
    expect(r).toBeDefined();
    expect(r?.name).toBe('Fake fake-1');
  });

  it('returns undefined for an unknown id', () => {
    expect(getRecipe('not-a-recipe')).toBeUndefined();
  });

  it('listRecipes returns every registered recipe', () => {
    registerRecipe(fakeRecipe('fake-a'));
    registerRecipe(fakeRecipe('fake-b'));
    const ids = listRecipes().map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['fake-a', 'fake-b']));
  });

  it('seeds summarize + extract_tasks via the barrel import', async () => {
    // Import the barrel so the side-effect registers the canonical
    // recipes. Must run after snapshot restore so the IDs are present.
    await import('../index.js');
    expect(getRecipe('summarize')).toBeDefined();
    expect(getRecipe('extract_tasks')).toBeDefined();
  });
});
