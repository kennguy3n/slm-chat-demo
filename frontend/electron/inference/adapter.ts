// Inference adapter contract — the canonical types shared between the
// Electron main process (which owns inference), the preload bridge, and
// the renderer's IPC stubs.
//
// This is the TypeScript port of `backend/internal/inference/adapter.go`.
// The shapes mirror that Go module 1:1 so the protocol survives a
// future swap back to HTTP if needed.

export type TaskType =
  | 'summarize'
  | 'translate'
  | 'extract_tasks'
  | 'smart_reply'
  | 'prefill_approval'
  | 'draft_artifact';

export const TaskTypes = {
  Summarize: 'summarize',
  Translate: 'translate',
  ExtractTasks: 'extract_tasks',
  SmartReply: 'smart_reply',
  PrefillApproval: 'prefill_approval',
  DraftArtifact: 'draft_artifact',
} as const satisfies Record<string, TaskType>;

export interface InferenceRequest {
  taskType: TaskType;
  model?: string;
  prompt?: string;
  channelId?: string;
  maxTokens?: number;
}

export interface InferenceResponse {
  taskType: TaskType;
  model: string;
  output: string;
  tokensUsed: number;
  latencyMs: number;
  onDevice: boolean;
}

export interface StreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
}

export interface ModelStatus {
  loaded: boolean;
  model: string;
  quant: string;
  ramUsageMB: number;
  sidecar: string;
}

export type Tier = 'e2b' | 'e4b';

export interface RouteDecision {
  decision: 'allow' | 'deny';
  allow: boolean;
  model: string;
  tier?: Tier;
  quant: string;
  computeLocation: 'on_device' | 'confidential_server' | 'shared_server';
  redactionRequired: boolean;
  dataEgressBytes: number;
  sourcesAllowed: string[];
  reason: string;
}

// Adapter is the contract every inference backend implements. The
// router (`router.ts`) is itself an Adapter, dispatching to a tier-
// specific concrete adapter (`OllamaAdapter` or `MockAdapter`).
export interface Adapter {
  name(): string;
  run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse>;
  stream(req: InferenceRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, void>;
}

// Optional capability surfaces — implemented by adapters that can
// report or manipulate live model state. The mock adapter does not.
export interface StatusProvider {
  status(signal?: AbortSignal): Promise<ModelStatus>;
}

export interface Loader {
  load(model: string, signal?: AbortSignal): Promise<void>;
  unload(model: string, signal?: AbortSignal): Promise<void>;
}

// SmartReplyRequest / TranslateRequest / etc. are the higher-level
// task shapes the renderer dispatches over IPC. The main-process
// handlers translate these into one or more `InferenceRequest`s
// before invoking the router.

export interface SmartReplyRequest {
  channelId: string;
  messageId?: string;
  // Recent messages used to seed the prompt. Kept in renderer-supplied
  // form (sender + content) so the main process is data-store agnostic.
  context: { senderId: string; content: string }[];
}

export interface SmartReplyResponse {
  replies: string[];
  model: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
  channelId: string;
  sourceMessageId?: string;
}

export interface TranslateRequest {
  messageId: string;
  channelId: string;
  text: string;
  targetLanguage?: string;
}

export interface TranslateResponse {
  messageId: string;
  channelId: string;
  original: string;
  translated: string;
  targetLanguage: string;
  model: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

export interface ExtractTasksRequest {
  channelId?: string;
  messageId?: string;
  focused: { id: string; channelId: string; senderId: string; content: string };
  context: { senderId: string; content: string }[];
}

export interface ExtractedTask {
  title: string;
  dueDate?: string;
  type: 'task' | 'reminder' | 'shopping';
}

export interface ExtractTasksResponse {
  tasks: ExtractedTask[];
  sourceMessageId: string;
  channelId: string;
  model: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

export interface ThreadSummaryRequest {
  threadId: string;
  // Renderer fetches the messages from the Go data API and forwards
  // them. The main process is responsible for prompt building.
  messages: { id: string; channelId: string; senderId: string; content: string }[];
}

export interface ThreadSummaryResponse {
  prompt: string;
  sources: { id: string; channelId: string; sender: string; excerpt: string }[];
  threadId: string;
  channelId: string;
  model: string;
  tier: Tier;
  reason: string;
  messageCount: number;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

export interface KAppsExtractTasksRequest {
  threadId: string;
  messages: { id: string; channelId: string; senderId: string; content: string }[];
}

export interface KAppsExtractedTask {
  title: string;
  owner?: string;
  dueDate?: string;
  status: string;
  sourceMessageId?: string;
}

export interface KAppsExtractTasksResponse {
  tasks: KAppsExtractedTask[];
  threadId: string;
  channelId: string;
  model: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

// PrefillApproval — B2B Phase 1 surface. Reads a thread, fills an
// approval template's structured fields (vendor / amount /
// justification / risk), and returns provenance per field. Always
// proposes; the human confirms before any approval is written.

export type ApprovalTemplate = 'vendor' | 'budget' | 'access';

export interface PrefillApprovalRequest {
  threadId: string;
  templateId?: ApprovalTemplate;
  messages: { id: string; channelId: string; senderId: string; content: string }[];
}

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
  tier: Tier;
  reason: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

// DraftArtifact — B2B Phase 1 surface. Same prompt-then-stream
// pattern as ThreadSummaryRequest: the helper builds a prompt + source
// list deterministically and the renderer streams the actual body via
// `ai:stream` with that prompt so the model runs exactly once. The
// router prefers E4B for `draft_artifact`.

export type ArtifactKind = 'PRD' | 'RFC' | 'Proposal' | 'SOP' | 'QBR';
export type ArtifactSection = 'goal' | 'requirements' | 'risks' | 'all';

export interface DraftArtifactRequest {
  threadId: string;
  artifactType: ArtifactKind;
  section?: ArtifactSection;
  messages: { id: string; channelId: string; senderId: string; content: string }[];
}

export interface DraftArtifactResponse {
  prompt: string;
  sources: { id: string; channelId: string; sender: string; excerpt: string }[];
  threadId: string;
  channelId: string;
  artifactType: ArtifactKind;
  section: ArtifactSection;
  title: string;
  model: string;
  tier: Tier;
  reason: string;
  messageCount: number;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

export interface UnreadSummaryRequest {
  // Recent messages the renderer has fetched from /api/chats. The main
  // process never reaches into the data store directly.
  chats: {
    id: string;
    name: string;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }[];
}

export interface UnreadSummaryResponse {
  prompt: string;
  model: string;
  sources: { id: string; channelId: string; sender: string; excerpt: string }[];
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

// ElectronAI is the contract `preload.ts` exposes on `window.electronAI`.
// `stream` returns a cancel function rather than a generator because
// the IPC bridge is event-driven; the renderer-side helpers in
// `frontend/src/api/streamAI.ts` keep AsyncGenerator semantics where
// they're useful.
export interface ElectronAI {
  run(req: InferenceRequest): Promise<InferenceResponse>;
  stream(
    req: InferenceRequest,
    onChunk: (chunk: StreamChunk) => void,
    onDone: () => void,
    onError?: (err: Error) => void,
  ): () => void;
  smartReply(req: SmartReplyRequest): Promise<SmartReplyResponse>;
  translate(req: TranslateRequest): Promise<TranslateResponse>;
  extractTasks(req: ExtractTasksRequest): Promise<ExtractTasksResponse>;
  summarizeThread(req: ThreadSummaryRequest): Promise<ThreadSummaryResponse>;
  extractKAppTasks(req: KAppsExtractTasksRequest): Promise<KAppsExtractTasksResponse>;
  prefillApproval(req: PrefillApprovalRequest): Promise<PrefillApprovalResponse>;
  draftArtifact(req: DraftArtifactRequest): Promise<DraftArtifactResponse>;
  unreadSummary(req: UnreadSummaryRequest): Promise<UnreadSummaryResponse>;
  modelStatus(): Promise<ModelStatus>;
  loadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  unloadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  route(req: InferenceRequest): Promise<RouteDecision>;
}
