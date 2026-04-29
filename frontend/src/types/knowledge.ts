// Phase 5 source-picker types. The source picker builds up a list of
// workspace surfaces (channels, threads, files) the user wants an AI
// Employee to read from before running an action. `SelectedSource`
// is the canonical envelope the renderer passes through to the IPC
// layer — everything that accepts AI source context will eventually
// consume this shape.

export type SelectedSourceKind = 'channel' | 'thread' | 'file';

export interface SelectedSource {
  kind: SelectedSourceKind;
  id: string;
  name: string;
  // Optional back-link so the UI can show "thread #123 in #engineering"
  // style labels. Only meaningful for kind === 'thread'.
  parentChannelId?: string;
  parentChannelName?: string;
  // For kind === 'file' the picker stamps the connector the file
  // came from so the chip + permission preview can show "Drive →
  // vendor-contract.pdf" attribution without an extra round trip.
  connectorId?: string;
  connectorName?: string;
}

// Phase 5 connector types — the renderer mirrors the backend models
// in `backend/internal/models/connector.go`.
export type ConnectorKind = 'google_drive' | 'onedrive' | 'github';

export type ConnectorStatus = 'connected' | 'disconnected';

export interface Connector {
  id: string;
  kind: ConnectorKind;
  name: string;
  workspaceId: string;
  channelIds: string[];
  status: ConnectorStatus;
  createdAt: string;
}

export interface ConnectorFile {
  id: string;
  connectorId: string;
  name: string;
  mimeType: string;
  size: number;
  excerpt: string;
  url: string;
  // Human-readable permission strings ("alice@acme.com:owner") used
  // for display in the permission preview.
  permissions: string[];
  // Machine-readable list of user IDs allowed to read this file.
  // Populated by POST /api/connectors/{id}/sync-acl. Empty list
  // means "ungated" (the seed before the first sync).
  acl?: string[];
}

// Phase 5 retrieval types.
export type RetrievalSourceKind = 'message' | 'file';

export interface RetrievalChunk {
  id: string;
  channelId: string;
  sourceKind: RetrievalSourceKind;
  sourceId: string;
  content: string;
  embedding?: number[];
}

export interface RetrievalResult {
  chunk: RetrievalChunk;
  score: number;
}

// ThreadSummary is the minimal payload the source picker needs to
// render a thread row. The demo derives these from channel messages
// (grouping by threadId) since the backend has no explicit thread
// listing endpoint yet.
export interface ThreadSummary {
  id: string;
  channelId: string;
  title: string;
  messageCount: number;
}

// Phase 5 knowledge graph types — mirror
// backend/internal/models/knowledge.go.
export type KnowledgeEntityKind =
  | 'decision'
  | 'owner'
  | 'risk'
  | 'requirement'
  | 'deadline';

export type KnowledgeEntityStatus = 'open' | 'resolved' | 'accepted';

export interface KnowledgeEntity {
  id: string;
  channelId: string;
  threadId?: string;
  sourceMessageId: string;
  kind: KnowledgeEntityKind;
  title: string;
  description: string;
  actors?: string[];
  dueDate?: string;
  status: KnowledgeEntityStatus;
  createdAt: string;
  confidence: number;
}
