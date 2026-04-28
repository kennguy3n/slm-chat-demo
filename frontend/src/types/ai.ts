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
export interface PrivacyStripWhyDetail {
  // The signal name (e.g. "Detected deadline", "Owner mentioned").
  signal: string;
  // Optional source pin so the user can jump to the message that
  // produced this signal.
  sourceId?: string;
  sourceLabel?: string;
}

export interface PrivacyStripData {
  computeLocation: ComputeLocation;
  modelName: string;
  sources: PrivacyStripSource[];
  dataEgressBytes: number;
  confidence?: number;
  missingInfo?: string[];
  whySuggested: string;
  // Optional structured details rendered when the user expands the
  // "Why" row. Each detail describes one signal that contributed to
  // the suggestion.
  whyDetails?: PrivacyStripWhyDetail[];
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

// SmartReplyResponse is returned by POST /api/ai/smart-reply. The server
// runs inference once and returns 2–3 short suggestions plus privacy
// metadata so the SmartReplyBar can render the strip without a second
// round trip.
export interface SmartReplyResponse {
  replies: string[];
  model: string;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
  channelId: string;
  sourceMessageId?: string;
}

// TranslateResponse is returned by POST /api/ai/translate. Carries both
// the original and translated text so the message bubble can toggle
// between them without re-fetching.
export interface TranslateResponse {
  messageId: string;
  channelId: string;
  original: string;
  translated: string;
  targetLanguage: string;
  model: string;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}

export type ExtractedTaskType = 'task' | 'reminder' | 'shopping';

export interface ExtractedTask {
  title: string;
  dueDate?: string;
  type: ExtractedTaskType;
}

// ExtractTasksResponse is the B2C task-extraction shape returned by
// POST /api/ai/extract-tasks.
export interface ExtractTasksResponse {
  tasks: ExtractedTask[];
  sourceMessageId: string;
  channelId: string;
  model: string;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}

// ThreadSummaryResponse follows the same no-double-inference contract as
// UnreadSummaryResponse: the server returns the prompt + sources, and the
// frontend streams the actual summary via /api/ai/stream.
export interface ThreadSummaryResponse {
  prompt: string;
  sources: UnreadSummarySource[];
  threadId: string;
  channelId: string;
  model: string;
  tier: 'e2b' | 'e4b';
  reason: string;
  messageCount: number;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}

export interface KAppsExtractedTask {
  title: string;
  owner?: string;
  dueDate?: string;
  status: string;
  sourceMessageId?: string;
}

// KAppsExtractTasksResponse is the B2B task-extraction shape returned by
// POST /api/kapps/tasks/extract. Adds owner / status / source provenance
// to the simpler B2C ExtractedTask.
export interface KAppsExtractTasksResponse {
  tasks: KAppsExtractedTask[];
  threadId: string;
  channelId: string;
  model: string;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}

// PrefillApproval — B2B Phase 1 surface. Reads a thread, fills an
// approval template, and returns the structured fields plus the
// source-message provenance.
export type ApprovalTemplate = 'vendor' | 'budget' | 'access';

export interface PrefilledApprovalFields {
  vendor?: string;
  amount?: string;
  justification?: string;
  risk?: string;
  extra?: Record<string, string>;
}

export interface PrefillApprovalResponse {
  threadId: string;
  channelId: string;
  templateId: ApprovalTemplate;
  title: string;
  fields: PrefilledApprovalFields;
  sourceMessageIds: string[];
  model: string;
  tier: 'e2b' | 'e4b';
  reason: string;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}

// DraftArtifact — B2B Phase 1 surface. Same prompt-then-stream contract
// as ThreadSummaryResponse.
export type ArtifactKind = 'PRD' | 'RFC' | 'Proposal' | 'SOP' | 'QBR';
export type ArtifactSection = 'goal' | 'requirements' | 'risks' | 'all';

export interface DraftArtifactResponse {
  prompt: string;
  sources: UnreadSummarySource[];
  threadId: string;
  channelId: string;
  artifactType: ArtifactKind;
  section: ArtifactSection;
  title: string;
  model: string;
  tier: 'e2b' | 'e4b';
  reason: string;
  messageCount: number;
  computeLocation: ComputeLocation;
  dataEgressBytes: number;
}
