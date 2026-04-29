import { apiFetch } from './client';
import type { AIEmployee } from '../types/aiEmployee';

// aiEmployeeApi mirrors the Phase 4 backend endpoints:
//
//   GET    /api/ai-employees               — list all AI Employees
//   GET    /api/ai-employees/{id}          — fetch a single profile
//   PATCH  /api/ai-employees/{id}/channels — update the allowed-channels list
//   PATCH  /api/ai-employees/{id}/recipes  — update the authorised recipes list

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
