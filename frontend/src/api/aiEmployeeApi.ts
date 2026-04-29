import { apiFetch } from './client';
import type { AIEmployee } from '../types/aiEmployee';

// aiEmployeeApi mirrors the Phase 4 backend endpoints:
//
//   GET    /api/ai-employees                        — list all AI Employees
//   GET    /api/ai-employees/{id}                   — fetch a single profile
//   PATCH  /api/ai-employees/{id}/channels          — update the allowed-channels list
//   PATCH  /api/ai-employees/{id}/recipes           — update the authorised recipes list
//   PATCH  /api/ai-employees/{id}/budget            — set the per-day token ceiling
//   POST   /api/ai-employees/{id}/budget/increment  — atomically bump usage (429 when over limit)

export async function fetchAIEmployees(): Promise<AIEmployee[]> {
  const data = await apiFetch<{ aiEmployees: AIEmployee[] }>('/api/ai-employees');
  return data.aiEmployees;
}

export async function fetchAIEmployee(id: string): Promise<AIEmployee> {
  const data = await apiFetch<{ aiEmployee: AIEmployee }>(
    `/api/ai-employees/${encodeURIComponent(id)}`,
  );
  return data.aiEmployee;
}

export async function updateAIEmployeeChannels(
  id: string,
  channelIds: string[],
): Promise<AIEmployee> {
  const data = await apiFetch<{ aiEmployee: AIEmployee }>(
    `/api/ai-employees/${encodeURIComponent(id)}/channels`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelIds }),
    },
  );
  return data.aiEmployee;
}

export async function updateAIEmployeeRecipes(
  id: string,
  recipeIds: string[],
): Promise<AIEmployee> {
  const data = await apiFetch<{ aiEmployee: AIEmployee }>(
    `/api/ai-employees/${encodeURIComponent(id)}/recipes`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeIds }),
    },
  );
  return data.aiEmployee;
}

// updateAIEmployeeBudget sets the per-day token ceiling for the AI
// Employee. `maxTokensPerDay` must be >= 0; the backend rejects
// negatives with HTTP 400.
export async function updateAIEmployeeBudget(
  id: string,
  maxTokensPerDay: number,
): Promise<AIEmployee> {
  const data = await apiFetch<{ aiEmployee: AIEmployee }>(
    `/api/ai-employees/${encodeURIComponent(id)}/budget`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxTokensPerDay }),
    },
  );
  return data.aiEmployee;
}

// BudgetExceededError is raised by `incrementAIEmployeeBudgetUsage`
// when the backend returns HTTP 429. The thrown error carries the
// refused employee profile so callers can surface the current
// used/max counters without re-fetching.
export class BudgetExceededError extends Error {
  constructor(public readonly aiEmployee: AIEmployee, message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// incrementAIEmployeeBudgetUsage atomically bumps the `usedTokensToday`
// counter. Throws `BudgetExceededError` (distinct from ApiError) on
// 429 responses so callers can branch on `instanceof BudgetExceededError`
// to render a refusal instead of a generic error. Uses raw fetch rather
// than `apiFetch` so 429s don't throw the generic ApiError.
export async function incrementAIEmployeeBudgetUsage(
  id: string,
  tokensUsed: number,
): Promise<AIEmployee> {
  const apiBase =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE
      ? (import.meta.env.VITE_API_BASE as string)
      : '';
  const res = await fetch(
    `${apiBase}/api/ai-employees/${encodeURIComponent(id)}/budget/increment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-User-ID': 'user_alice',
      },
      body: JSON.stringify({ tokensUsed }),
    },
  );
  if (res.status === 429) {
    const body = await res.json().catch(() => ({ aiEmployee: null, error: 'budget exceeded' }));
    throw new BudgetExceededError(body.aiEmployee, body.error || 'budget exceeded');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const body = (await res.json()) as { aiEmployee: AIEmployee };
  return body.aiEmployee;
}
