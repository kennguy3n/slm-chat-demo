// Type declarations for the Electron preload bridge. The shapes mirror
// `frontend/electron/inference/adapter.ts` (the canonical types). This
// file lives in `src/` so the renderer compiles without importing from
// `electron/`.

import type {
  ApprovalTemplate,
  ArtifactKind,
  ArtifactSection,
  DraftArtifactResponse,
  EventRSVPResponse,
  ExtractTasksResponse,
  FamilyChecklistResponse,
  PrefillApprovalResponse,
  PrefillFormResponse,
  ShoppingNudgesResponse,
  SmartReplyResponse,
  ThreadSummaryResponse,
  TranslateResponse,
  UnreadSummaryResponse,
  AIRouteResponse,
  AIRunRequest,
  AIRunResponse,
  ModelStatus,
  KAppsExtractTasksResponse,
} from './ai';

interface ElectronStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
}

// ---------- trip-planner types ----------

export interface TripPlannerMemoryFact {
  id: string;
  kind: string;
  text: string;
}

export interface TripPlannerInputArgs {
  destination: string;
  duration: number;
  dateRange?: { start: string; end: string };
  focus?: string;
  memoryFacts: TripPlannerMemoryFact[];
}

export interface TripPlannerItineraryItem {
  title: string;
  detail?: string;
  sourceLabel?: string;
  sourceId?: string;
}

export interface TripPlannerItineraryDay {
  day: number;
  weatherNote?: string;
  items: TripPlannerItineraryItem[];
}

export interface TripPlannerItinerary {
  destination: string;
  durationDays: number;
  summary: string;
  days: TripPlannerItineraryDay[];
  weatherSources: string[];
  eventSources: string[];
  attractionSources: string[];
  memorySources: string[];
}

export interface TripPlannerWeather {
  date: string;
  summary: string;
  highF?: number;
  lowF?: number;
}

export interface TripPlannerEvent {
  id: string;
  title: string;
  date: string;
  whenHint?: string;
  category?: string;
  venue?: string;
  source: string;
}

export interface TripPlannerAttraction {
  id: string;
  name: string;
  category: string;
  description: string;
  source: string;
}

export interface TripPlannerSkillSource {
  kind: 'message' | 'memory' | 'tool';
  id: string;
  label?: string;
}

export interface TripPlannerPrivacy {
  computeLocation: 'on_device' | 'confidential_server';
  modelName: string;
  tier: 'e2b' | 'e4b';
  reason: string;
  dataEgressBytes: number;
  sources: TripPlannerSkillSource[];
}

export type TripPlannerSkillResult =
  | {
      status: 'ok';
      skillId: string;
      result: TripPlannerItinerary;
      sources: TripPlannerSkillSource[];
      confidence: number;
      rawOutput: string;
      privacy: TripPlannerPrivacy;
    }
  | {
      status: 'refused';
      skillId: string;
      refusal: {
        reason: string;
        origin: 'pre_inference' | 'insufficient' | 'post_inference' | 'parse_failed';
        refusalText: string;
      };
      privacy: TripPlannerPrivacy | null;
    };

export interface TripPlannerExecution {
  weather: TripPlannerWeather[];
  events: TripPlannerEvent[];
  attractions: TripPlannerAttraction[];
  prompt: string;
  result: TripPlannerSkillResult;
}

// ---------- guardrail-rewrite types ----------

export type GuardrailRiskCategory = 'pii' | 'tone' | 'unverified-claim';

export interface GuardrailFinding {
  category: GuardrailRiskCategory;
  excerpt: string;
  reason: string;
  source: 'regex' | 'model';
}

export interface GuardrailRewriteResult {
  safe: boolean;
  findings: GuardrailFinding[];
  rewrite?: string;
  rationale: string;
}

export type GuardrailSkillResult =
  | {
      status: 'ok';
      skillId: string;
      result: GuardrailRewriteResult;
      sources: TripPlannerSkillSource[];
      confidence: number;
      rawOutput: string;
      privacy: TripPlannerPrivacy;
    }
  | {
      status: 'refused';
      skillId: string;
      refusal: {
        reason: string;
        origin: 'pre_inference' | 'insufficient' | 'post_inference' | 'parse_failed';
        refusalText: string;
      };
      privacy: TripPlannerPrivacy | null;
    };

interface ElectronAIBridge {
  run(req: AIRunRequest): Promise<AIRunResponse>;
  // Returns a cancel function. Streaming uses fire-and-forget IPC events.
  stream(
    req: AIRunRequest,
    onChunk: (chunk: ElectronStreamChunk) => void,
    onDone: () => void,
    onError?: (err: Error) => void,
  ): () => void;
  smartReply(req: {
    channelId: string;
    messageId?: string;
    context: { senderId: string; content: string }[];
  }): Promise<SmartReplyResponse>;
  translate(req: {
    messageId: string;
    channelId: string;
    text: string;
    targetLanguage?: string;
  }): Promise<TranslateResponse>;
  extractTasks(req: {
    channelId?: string;
    messageId?: string;
    focused: { id: string; channelId: string; senderId: string; content: string };
    context: { senderId: string; content: string }[];
  }): Promise<ExtractTasksResponse>;
  summarizeThread(req: {
    threadId: string;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }): Promise<ThreadSummaryResponse>;
  extractKAppTasks(req: {
    threadId: string;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }): Promise<KAppsExtractTasksResponse>;
  prefillApproval(req: {
    threadId: string;
    templateId?: ApprovalTemplate;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }): Promise<PrefillApprovalResponse>;
  prefillForm(req: {
    threadId: string;
    templateId: string;
    fields: string[];
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }): Promise<PrefillFormResponse>;
  draftArtifact(req: {
    threadId: string;
    artifactType: ArtifactKind;
    section?: ArtifactSection;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }): Promise<DraftArtifactResponse>;
  unreadSummary(req: {
    chats: {
      id: string;
      name: string;
      messages: { id: string; channelId: string; senderId: string; content: string }[];
    }[];
  }): Promise<UnreadSummaryResponse>;
  familyChecklist(req: {
    channelId: string;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
    eventHint?: string;
  }): Promise<FamilyChecklistResponse>;
  shoppingNudges(req: {
    channelId: string;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
    existingItems: string[];
  }): Promise<ShoppingNudgesResponse>;
  eventRSVP(req: {
    channelId: string;
    messages: { id: string; channelId: string; senderId: string; content: string }[];
  }): Promise<EventRSVPResponse>;
  tripPlan(req: {
    input: TripPlannerInputArgs;
    channelId?: string;
  }): Promise<TripPlannerExecution>;
  guardrailCheck(req: {
    input: { text: string; channelId?: string };
  }): Promise<GuardrailSkillResult>;
  // Phase 4 — generic AI-Employee recipe runner. The renderer
  // supplies the AI Employee's allowed recipe ids so the main process
  // can refuse recipes the employee is not authorised for. Output
  // shape is recipe-specific (`unknown`); the renderer narrows via
  // `recipeId` at the call site.
  recipeRun(req: {
    recipeId: string;
    aiEmployeeId: string;
    channelId: string;
    threadId?: string;
    messages: Array<{
      id: string;
      channelId: string;
      senderId: string;
      content: string;
    }>;
    allowedRecipes?: string[];
  }): Promise<{
    status: 'ok' | 'refused';
    output: unknown;
    model: string;
    tier: 'e2b' | 'e4b';
    reason: string;
  }>;
  modelStatus(): Promise<ModelStatus>;
  loadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  unloadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  route(req: AIRunRequest): Promise<AIRouteResponse>;
  // Phase 6 — confidential-server egress tally. The renderer reads
  // these for the EgressSummaryPanel and the TopBar badge. Reset is
  // an explicit user-driven action (the panel surfaces a button).
  egressSummary(): Promise<EgressSummaryResult>;
  egressReset(): Promise<EgressSummaryResult>;
}

export interface EgressSummaryEntry {
  timestamp: number;
  taskType: string;
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

declare global {
  interface Window {
    electronAI?: ElectronAIBridge;
  }
}

export {};
