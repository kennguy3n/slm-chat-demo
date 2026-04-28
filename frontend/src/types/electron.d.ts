// Type declarations for the Electron preload bridge. The shapes mirror
// `frontend/electron/inference/adapter.ts` (the canonical types). This
// file lives in `src/` so the renderer compiles without importing from
// `electron/`.

import type {
  ExtractTasksResponse,
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
  unreadSummary(req: {
    chats: {
      id: string;
      name: string;
      messages: { id: string; channelId: string; senderId: string; content: string }[];
    }[];
  }): Promise<UnreadSummaryResponse>;
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
