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
  modelStatus(): Promise<ModelStatus>;
  loadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  unloadModel(model?: string): Promise<{ loaded: boolean; model: string }>;
  route(req: AIRunRequest): Promise<AIRouteResponse>;
}

declare global {
  interface Window {
    electronAI?: ElectronAIBridge;
  }
}

export {};
