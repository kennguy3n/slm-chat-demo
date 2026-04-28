import { apiFetch } from './client';
import type {
  AIRouteResponse,
  AIRunRequest,
  AIRunResponse,
  EgressPreview,
  ModelStatus,
} from '../types/ai';

// Phase 0: model/status returns a stubbed "unloaded" state. Phase 1 wires this
// to the real local sidecar.
export async function fetchModelStatus(): Promise<ModelStatus> {
  return apiFetch<ModelStatus>('/api/model/status');
}

// Phase 0: privacy/egress-preview returns the hardcoded zero-egress preview.
// The privacy strip uses it to render the "data egress" element.
export async function fetchEgressPreview(): Promise<EgressPreview> {
  return apiFetch<EgressPreview>('/api/privacy/egress-preview');
}

// Run the AI inference adapter. Phase 0 is wired to MockAdapter and returns
// canned outputs for each task type.
export async function runAITask(req: AIRunRequest): Promise<AIRunResponse> {
  return apiFetch<AIRunResponse>('/api/ai/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

// Ask the policy engine whether an inference call should be allowed. Phase 0
// hardcodes the on-device, zero-egress decision.
export async function fetchAIRoute(req: AIRunRequest): Promise<AIRouteResponse> {
  return apiFetch<AIRouteResponse>('/api/ai/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}
