// Unit tests for the Phase 4 budget gate inside `runRecipe`
// (electron/ipc-handlers.ts). The test stubs global `fetch` so it
// can simulate the backend returning 429/200/404 without booting the
// HTTP server; the recipe registry is restored after each test so
// the seeded recipes survive mutations.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `electron` is a native module that can't be loaded under vitest's
// jsdom worker. We only use `ipcMain` for its `.handle` registration
// in the IPC bootstrap — the exported `runRecipe` itself has no
// Electron-specific dependency, so a minimal stub is all tests need.
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

import {
  RECIPE_REGISTRY,
  registerRecipe,
  type RecipeDefinition,
} from '../registry.js';
import { runRecipe } from '../../../ipc-handlers.js';
import type { InferenceRouter } from '../../router.js';

function fakeRecipe(id: string): RecipeDefinition {
  return {
    id,
    name: `Fake ${id}`,
    description: 'fake recipe for tests',
    taskType: 'summarize',
    preferredTier: 'e2b',
    async execute() {
      return {
        status: 'ok',
        output: { id, ran: true },
        model: 'mock-2b',
        tier: 'e2b',
        reason: 'test executed',
      };
    },
  };
}

const ROUTER = {} as InferenceRouter;

describe('runRecipe budget gate', () => {
  const before = new Map(RECIPE_REGISTRY);
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    RECIPE_REGISTRY.clear();
    for (const [k, v] of before) RECIPE_REGISTRY.set(k, v);
    registerRecipe(fakeRecipe('budget_fake'));
    fetchSpy.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('refuses with "budget exceeded" reason when backend returns 429', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ aiEmployee: null, error: 'ai_employees: budget exceeded' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await runRecipe(ROUTER, {
      recipeId: 'budget_fake',
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'th_1',
      messages: [
        { id: 'm1', channelId: 'ch_general', senderId: 'u1', content: 'hello' },
      ],
      apiBaseUrl: 'http://mock.local',
    });

    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/budget exceeded/i);
    // The recipe should NOT have been executed — the fake recipe
    // would have marked output.ran=true if it had.
    expect(result.output).toBeNull();
    // Exactly one POST to the increment endpoint, no recipe-side
    // fetches.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(
      '/api/ai-employees/ai_kara_ops/budget/increment',
    );
    expect(init?.method).toBe('POST');
  });

  it('executes the recipe when the backend returns 200 OK', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ aiEmployee: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await runRecipe(ROUTER, {
      recipeId: 'budget_fake',
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'th_1',
      messages: [
        { id: 'm1', channelId: 'ch_general', senderId: 'u1', content: 'hello' },
      ],
      apiBaseUrl: 'http://mock.local',
    });

    expect(result.status).toBe('ok');
    expect(result.output).toMatchObject({ ran: true });
  });

  it('falls open on a network error so offline demos still run', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    const result = await runRecipe(ROUTER, {
      recipeId: 'budget_fake',
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'th_1',
      messages: [
        { id: 'm1', channelId: 'ch_general', senderId: 'u1', content: 'hello' },
      ],
      apiBaseUrl: 'http://mock.local',
    });

    expect(result.status).toBe('ok');
  });

  it('refuses when the employee is unknown (404)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'not found' }), { status: 404 }),
    );

    const result = await runRecipe(ROUTER, {
      recipeId: 'budget_fake',
      aiEmployeeId: 'ai_ghost',
      channelId: 'ch_general',
      threadId: 'th_1',
      messages: [
        { id: 'm1', channelId: 'ch_general', senderId: 'u1', content: 'hello' },
      ],
      apiBaseUrl: 'http://mock.local',
    });

    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/not found/i);
  });

  it('refuses unauthorised recipes without calling the budget endpoint', async () => {
    const result = await runRecipe(ROUTER, {
      recipeId: 'budget_fake',
      allowedRecipes: ['summarize'],
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'th_1',
      messages: [
        { id: 'm1', channelId: 'ch_general', senderId: 'u1', content: 'hello' },
      ],
      apiBaseUrl: 'http://mock.local',
    });

    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/not authorised/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
