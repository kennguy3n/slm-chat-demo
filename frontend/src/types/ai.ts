// Phase 0 placeholder for AI route/run/stream payloads.
export interface ModelStatus {
  loaded: boolean;
  model: string;
  quant: string;
  ramUsageMB: number;
  sidecar: string;
}
