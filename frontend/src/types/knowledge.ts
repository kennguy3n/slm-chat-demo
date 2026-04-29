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
