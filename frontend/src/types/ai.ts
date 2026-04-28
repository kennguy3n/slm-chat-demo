// Shared AI / privacy types. Used by the privacy strip, the AI action
// launcher, and the AI API client.

export interface ModelStatus {
  loaded: boolean;
  model: string;
  quant: string;
  ramUsageMB: number;
  sidecar: string;
}

export type ComputeLocation = 'on_device' | 'confidential_server' | 'shared_server';

export interface PrivacyStripSource {
  kind: 'message' | 'thread' | 'file' | 'connector' | 'memory';
  id: string;
  label: string;
}

// PrivacyStripData encodes the eight required AI UI elements from
// PROPOSAL.md section 4.3:
//   1. compute location, 2. model name, 3. sources used,
//   4. data egress bytes, 5. confidence + missing info,
//   6. why suggested, 7. accept/edit/discard buttons,
//   8. linked origin (back-link to originating message/thread).
//
// Phase 0 callers populate this with mocked values; Phase 1 replaces the
// mock with the real policy-engine + adapter outputs.
export interface PrivacyStripData {
  computeLocation: ComputeLocation;
  modelName: string;
  sources: PrivacyStripSource[];
  dataEgressBytes: number;
  confidence?: number;
  missingInfo?: string[];
  whySuggested: string;
  origin: {
    kind: 'message' | 'thread';
    id: string;
    label: string;
  };
}

export interface PrivacyStripCallbacks {
  onAccept?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}

export type AIRouteDecision = 'allow' | 'deny' | 'downgrade';

export interface AIRouteResponse {
  decision: AIRouteDecision;
  model: string;
  quant: string;
  computeLocation: ComputeLocation;
  redactionRequired: boolean;
  dataEgressBytes: number;
  sourcesAllowed: string[];
  // Phase 1+: human-readable explanation of the routing decision (which
  // tier, why) — surfaced by the privacy strip.
  reason?: string;
  tier?: 'e2b' | 'e4b';
}

export type AITaskType =
  | 'summarize'
  | 'translate'
  | 'extract_tasks'
  | 'smart_reply'
  | 'prefill_approval'
  | 'draft_artifact';

export interface AIRunRequest {
  taskType: AITaskType;
  prompt?: string;
  channelId?: string;
  model?: string;
}

export interface AIRunResponse {
  taskType: AITaskType;
  model: string;
  output: string;
  tokensUsed: number;
  latencyMs: number;
  onDevice: boolean;
}

export interface EgressPreview {
  egressBytes: number;
  sources: string[];
}

// UnreadSummaryResponse is the shape returned by GET /api/chats/unread-summary.
// The endpoint deliberately does NOT run inference — it returns the prompt
// it built plus the source messages used to build it, so the caller can
// stream the actual digest exactly once via /api/ai/stream and back-link
// each digest item to its origin. Running the model here as well would
// be a wasted second inference pass (and a visible text swap in the UI
// once the streamed and post-stream texts disagree).
export interface UnreadSummarySource {
  id: string;
  channelId: string;
  sender: string;
  excerpt: string;
}

export interface UnreadSummaryResponse {
  prompt: string;
  model: string;
  sources: UnreadSummarySource[];
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}
