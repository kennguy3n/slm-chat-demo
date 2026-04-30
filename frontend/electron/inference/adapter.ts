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
  | 'prefill_form'
  | 'draft_artifact';

export const TaskTypes = {
  Summarize: 'summarize',
  Translate: 'translate',
  ExtractTasks: 'extract_tasks',
  SmartReply: 'smart_reply',
  PrefillApproval: 'prefill_approval',
  PrefillForm: 'prefill_form',
  DraftArtifact: 'draft_artifact',
} as const satisfies Record<string, TaskType>;

export interface InferenceRequest {
  taskType: TaskType;
  model?: string;
  prompt?: string;
  channelId?: string;
  maxTokens?: number;
  // Phase 6 — explicit tier selection so the dispatcher can ask for
  // server compute (e.g. user-toggled "Confidential Server" mode).
  // Omit or pass 'local' for on-device compute; pass 'server' to
  // request the confidential-server tier. The router gates 'server'
  // on workspace policy + adapter availability and refuses with a
  // clear reason when it cannot satisfy the request.
  tier?: Tier;
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
  // Phase 6 — confidential-server tier reporting. Populated by the
  // model-status IPC handler when the bootstrap successfully pinged
  // the server. Renderer reads these via `window.electronAI.modelStatus`.
  serverModel?: string;
  serverAvailable?: boolean;
  serverUrl?: string;
}

// Tier distinguishes on-device inference from the (optional, policy-
// gated) confidential-server tier. The demo ships a single on-device
// model (Ternary-Bonsai-8B) so there is no local-tier subdivision —
// anything not explicitly server-bound runs locally.
export type Tier = 'local' | 'server';

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
// specific concrete adapter (`OllamaAdapter`, `MockAdapter`, or the
// Phase 6 `ConfidentialServerAdapter`).
export interface Adapter {
  name(): string;
  run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse>;
  stream(req: InferenceRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, void>;
}

// ConfidentialServerAdapter is the optional capability surface a
// Phase 6 server-tier adapter exposes. It carries the configured
// server URL so the router / privacy strip can show *where* data
// would go before the user confirms a server-bound action.
export interface ConfidentialServerAdapter extends Adapter {
  readonly serverURL: string;
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

// Batch translation — one model call covers N messages. Much faster
// than N separate /api/generate calls on CPU inference where each
// independent request pays the prompt-eval cost up front.
export interface TranslateBatchItem {
  messageId: string;
  channelId: string;
  text: string;
  targetLanguage: string;
}

export interface TranslateBatchRequest {
  items: TranslateBatchItem[];
}

export interface TranslateBatchResponse {
  results: TranslateResponse[];
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

// PrefillForm — Phase 3 Forms intake. Reads a thread, fills a form
// template's fields with on-device inference, returns provenance per
// field. Same opt-in pattern as PrefillApproval.

export interface PrefillFormRequest {
  threadId: string;
  templateId: string;
  // Field names the renderer wants the AI to fill — usually all of the
  // template's fields, but the contract allows the renderer to ask for
  // a subset (e.g. just the missing ones).
  fields: string[];
  messages: { id: string; channelId: string; senderId: string; content: string }[];
}

export interface PrefillFormResponse {
  threadId: string;
  channelId: string;
  templateId: string;
  fields: Record<string, string>;
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
// `ai:stream` with that prompt so the on-device model runs exactly once.

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

// ---------- Phase 2 B2C second-brain surfaces ----------
//
// The next batch of B2C surfaces all share the same shape: read recent
// chat messages from a single chat, run a single on-device inference,
// return a structured set of items the renderer can render as cards.
// None of the requests carry persistent state — the renderer stores
// any user-confirmed memory locally (IndexedDB) and re-supplies the
// relevant context on each call.

export interface FamilyChecklistItem {
  title: string;
  // dueHint is a soft, free-form deadline ("tonight", "Friday morning")
  // pulled from the chat. Always renderer-displayable as-is.
  dueHint?: string;
  sourceMessageId?: string;
}

export interface FamilyChecklistRequest {
  channelId: string;
  // Recent messages (last ~30) the renderer fetched from the data API.
  messages: { id: string; channelId: string; senderId: string; content: string }[];
  // Optional event hint ("Soccer practice tomorrow", "Birthday party
  // Saturday") so the model can ground the checklist around it.
  eventHint?: string;
}

export interface FamilyChecklistResponse {
  channelId: string;
  title: string;
  items: FamilyChecklistItem[];
  sourceMessageIds: string[];
  model: string;
  tier: Tier;
  reason: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

export interface ShoppingNudge {
  // Suggested item to add to the list.
  item: string;
  // Reason — referenced back to a chat message when possible
  // ("Add sunscreen because field trip is tomorrow").
  reason: string;
  sourceMessageId?: string;
}

export interface ShoppingNudgesRequest {
  channelId: string;
  messages: { id: string; channelId: string; senderId: string; content: string }[];
  // Items already on the user's shopping list — the model uses these to
  // avoid duplicating suggestions.
  existingItems: string[];
}

export interface ShoppingNudgesResponse {
  channelId: string;
  nudges: ShoppingNudge[];
  sourceMessageIds: string[];
  model: string;
  tier: Tier;
  reason: string;
  computeLocation: 'on_device';
  dataEgressBytes: 0;
}

export interface RSVPEvent {
  title: string;
  // Free-form date/time hint ("Saturday 3pm", "Friday afternoon").
  whenHint?: string;
  location?: string;
  rsvpBy?: string;
  sourceMessageId?: string;
}

export interface EventRSVPRequest {
  channelId: string;
  messages: { id: string; channelId: string; senderId: string; content: string }[];
}

export interface EventRSVPResponse {
  channelId: string;
  events: RSVPEvent[];
  sourceMessageIds: string[];
  model: string;
  tier: Tier;
  reason: string;
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
  translateBatch(req: TranslateBatchRequest): Promise<TranslateBatchResponse>;
  extractTasks(req: ExtractTasksRequest): Promise<ExtractTasksResponse>;
  summarizeThread(req: ThreadSummaryRequest): Promise<ThreadSummaryResponse>;
  extractKAppTasks(req: KAppsExtractTasksRequest): Promise<KAppsExtractTasksResponse>;
  prefillApproval(req: PrefillApprovalRequest): Promise<PrefillApprovalResponse>;
  prefillForm(req: PrefillFormRequest): Promise<PrefillFormResponse>;
  draftArtifact(req: DraftArtifactRequest): Promise<DraftArtifactResponse>;
  unreadSummary(req: UnreadSummaryRequest): Promise<UnreadSummaryResponse>;
  familyChecklist(req: FamilyChecklistRequest): Promise<FamilyChecklistResponse>;
  shoppingNudges(req: ShoppingNudgesRequest): Promise<ShoppingNudgesResponse>;
  eventRSVP(req: EventRSVPRequest): Promise<EventRSVPResponse>;
  // Phase 2 trip planner — opaque payloads here so the adapter module
  // does not have to import the skill module (which depends on the
  // search service); the renderer side gets full types via the
  // dedicated `frontend/src/types/electron.d.ts` augmentation.
  tripPlan(req: unknown): Promise<unknown>;
  guardrailCheck(req: unknown): Promise<unknown>;
  recipeRun(req: unknown): Promise<unknown>;
  modelStatus(): Promise<ModelStatus>;
  loadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  unloadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  route(req: InferenceRequest): Promise<RouteDecision>;
  // Phase 6 — running tally of bytes that have left the device for
  // the confidential server. The renderer's `EgressSummaryPanel` and
  // the TopBar egress badge both read from here. Falls back to a
  // zero-state value when no Electron bridge is present.
  egressSummary(): Promise<EgressSummaryResult>;
  egressReset(): Promise<EgressSummaryResult>;
}

export interface EgressSummaryEntry {
  timestamp: number;
  taskType: TaskType;
  egressBytes: number;
  redactionCount: number;
  model: string;
  channelId?: string;
}

export interface EgressSummaryResult {
  totalBytes: number;
  totalRequests: number;
  totalRedactions: number;
  byChannel: Record<string, { bytes: number; requests: number }>;
  byModel: Record<string, { bytes: number; requests: number }>;
  recent: EgressSummaryEntry[];
}
