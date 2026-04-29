// Phase 6 — per-workspace AI compute policy. Mirrors
// backend/internal/models/policy.go so the PolicyAdminPanel can read
// and write it without an extra translation layer.

export interface WorkspacePolicy {
  workspaceId: string;
  allowServerCompute: boolean;
  serverAllowedTasks: string[];
  serverDeniedTasks: string[];
  maxEgressBytesPerDay: number;
  requireRedaction: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface WorkspacePolicyPatch {
  allowServerCompute?: boolean;
  serverAllowedTasks?: string[];
  serverDeniedTasks?: string[];
  maxEgressBytesPerDay?: number;
  requireRedaction?: boolean;
  updatedBy?: string;
}

// The list of TaskTypes the policy panel exposes as toggles. Kept in
// sync with frontend/electron/inference/adapter.ts TaskType.
export const POLICY_TASK_TYPES = [
  'summarize',
  'translate',
  'extract_tasks',
  'smart_reply',
  'prefill_approval',
  'prefill_form',
  'draft_artifact',
] as const;

export type PolicyTaskType = (typeof POLICY_TASK_TYPES)[number];
