import { apiFetch } from './client';
import type { ModelStatus } from '../types/ai';

// Phase 0: model/status returns a stubbed "unloaded" state. Phase 1 wires this
// to the real local sidecar.
export async function fetchModelStatus(): Promise<ModelStatus> {
  return apiFetch<ModelStatus>('/api/model/status');
}
