import { apiFetch } from './client';
import type { WorkspacePolicy, WorkspacePolicyPatch } from '../types/policy';

interface PolicyEnvelope {
  policy: WorkspacePolicy;
}

// fetchWorkspacePolicy returns the current AI compute policy for a
// workspace (Phase 6). The PolicyAdminPanel pre-fills its toggles
// from this response.
export async function fetchWorkspacePolicy(workspaceId: string): Promise<WorkspacePolicy> {
  const data = await apiFetch<PolicyEnvelope>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/policy`,
  );
  return data.policy;
}

// updateWorkspacePolicy PATCHes the policy. Only fields present on
// `patch` are mutated server-side; everything else is preserved.
export async function updateWorkspacePolicy(
  workspaceId: string,
  patch: WorkspacePolicyPatch,
): Promise<WorkspacePolicy> {
  const data = await apiFetch<PolicyEnvelope>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/policy`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return data.policy;
}
