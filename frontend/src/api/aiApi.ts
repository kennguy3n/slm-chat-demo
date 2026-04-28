import { apiFetch } from './client';
import type {
  AIRouteResponse,
  AIRunRequest,
  AIRunResponse,
  EgressPreview,
  ModelStatus,
  UnreadSummaryResponse,
} from '../types/ai';

// model/status returns the current local-model state. When the backend has
// an Ollama adapter wired in this is live data; otherwise it's the static
// "unstarted" stub.
export async function fetchModelStatus(): Promise<ModelStatus> {
  return apiFetch<ModelStatus>('/api/model/status');
}

// loadModel asks the backend to preload a specific local model. Optional
// model name; backend defaults to its configured default.
export async function loadModel(model?: string): Promise<{ loaded: boolean; model: string }> {
  return apiFetch('/api/model/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model ? { model } : {}),
  });
}

// unloadModel asks the backend to free a model from memory.
export async function unloadModel(model?: string): Promise<{ loaded: boolean; model: string }> {
  return apiFetch('/api/model/unload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model ? { model } : {}),
  });
}

// fetchUnreadSummary calls the AI digest endpoint that summarises the
// authenticated user's recent B2C messages.
export async function fetchUnreadSummary(): Promise<UnreadSummaryResponse> {
  return apiFetch<UnreadSummaryResponse>('/api/chats/unread-summary');
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
