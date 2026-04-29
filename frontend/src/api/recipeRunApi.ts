import { apiFetch } from './client';
import type { RecipeRun } from '../types/aiEmployee';

// recipeRunApi mirrors the Phase 4 AI-Employee queue endpoints:
//
//   GET  /api/ai-employees/{id}/queue — list queued + completed recipe runs
//   POST /api/ai-employees/{id}/queue — record a new recipe run (pending/running)

export async function fetchQueue(aiEmployeeId: string): Promise<RecipeRun[]> {
  const data = await apiFetch<{ recipeRuns: RecipeRun[] }>(
    `/api/ai-employees/${encodeURIComponent(aiEmployeeId)}/queue`,
  );
  return data.recipeRuns;
}

// recordRun accepts the forward-compatible shape (caller supplies
// recipeId + channelId; service fills in id + createdAt if blank).
export type RecordRunPayload = Omit<RecipeRun, 'id' | 'aiEmployeeId' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

export async function recordRun(
  aiEmployeeId: string,
  run: RecordRunPayload,
): Promise<RecipeRun> {
  const data = await apiFetch<{ recipeRun: RecipeRun }>(
    `/api/ai-employees/${encodeURIComponent(aiEmployeeId)}/queue`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    },
  );
  return data.recipeRun;
}
