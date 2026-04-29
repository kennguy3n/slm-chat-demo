import { useEffect, useMemo, useState } from 'react';
import type { Channel } from '../../types/workspace';
import type {
  Connector,
  ConnectorFile,
  SelectedSource,
  SelectedSourceKind,
  ThreadSummary,
} from '../../types/knowledge';
import { fetchWorkspaceChannels, fetchChannelMessages } from '../../api/chatApi';
import {
  fetchChannelConnectorFiles,
  fetchConnectorFiles,
  fetchConnectors,
} from '../../api/connectorApi';

type TabId = 'channels' | 'threads' | 'files';

interface Props {
  workspaceId: string;
  // initial sources preselected (e.g. when re-opening the picker
  // after the user already picked something). Defaults to [].
  initialSelected?: SelectedSource[];
  onSelect: (sources: SelectedSource[]) => void;
  onCancel: () => void;
  // Optional channel context. When provided, the Files tab shows
  // only files reachable from this channel via attached connectors
  // (the privacy boundary). When omitted, the Files tab falls back
  // to listing every connector in the workspace and its files.
  channelId?: string;
  // Test seam — lets the picker tests stub the network layer without
  // intercepting global fetch.
  api?: {
    fetchWorkspaceChannels?: (workspaceId: string) => Promise<Channel[]>;
    fetchChannelThreads?: (channelId: string) => Promise<ThreadSummary[]>;
    fetchChannelConnectorFiles?: (channelId: string) => Promise<ConnectorFile[]>;
    fetchConnectors?: (workspaceId: string) => Promise<Connector[]>;
  };
}

// deriveThreadsFromMessages groups messages by threadId and computes
// a compact ThreadSummary for each, using the first message's content
// as the title. The demo backend does not ship a per-channel thread
// listing endpoint — the picker derives the list from the messages
// API instead, which keeps the Phase 5 kickoff UI-only.
async function deriveThreadsForChannel(
  channelId: string,
): Promise<ThreadSummary[]> {
  const messages = await fetchChannelMessages(channelId);
  const byThread = new Map<string, { title: string; count: number }>();
  for (const m of messages) {
    if (!m.threadId) continue;
    const existing = byThread.get(m.threadId);
    if (existing) {
      existing.count += 1;
    } else {
      const title = m.content.split('\n')[0].slice(0, 80) || 'Untitled thread';
      byThread.set(m.threadId, { title, count: 1 });
    }
  }
  return [...byThread.entries()].map(([id, v]) => ({
    id,
    channelId,
    title: v.title,
    messageCount: v.count,
  }));
}

// SourcePicker lets a B2B user scope which channels, threads, and
// (eventually) files an AI Employee is allowed to read from before
// running an action. The picker is a modal-ish right-rail panel —
// three tabs, a removable chip list of current selections, and
// Confirm / Cancel buttons at the bottom.
//
// Phase 5 — channels + threads + files are wired. The Files tab
// reads from the seeded Google Drive connector via
// fetchChannelConnectorFiles (channel-scoped) so the picker enforces
// the same per-channel attachment boundary as the backend.
export function SourcePicker({
  workspaceId,
  channelId,
  initialSelected,
  onSelect,
  onCancel,
  api,
}: Props) {
  const [tab, setTab] = useState<TabId>('channels');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ThreadSummary[]>>({});
  const [threadsLoading, setThreadsLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [selected, setSelected] = useState<SelectedSource[]>(
    initialSelected ?? [],
  );

  const fetchChannels = api?.fetchWorkspaceChannels ?? fetchWorkspaceChannels;
  const fetchThreads = api?.fetchChannelThreads ?? deriveThreadsForChannel;
  const fetchChannelFiles =
    api?.fetchChannelConnectorFiles ?? fetchChannelConnectorFiles;
  const fetchWorkspaceConnectors = api?.fetchConnectors ?? fetchConnectors;

  const [files, setFiles] = useState<ConnectorFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [connectorsByID, setConnectorsByID] = useState<Record<string, Connector>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    setChannelsLoading(true);
    setChannelsError(null);
    fetchChannels(workspaceId).then(
      (list) => {
        if (cancelled) return;
        setChannels(list);
        setChannelsLoading(false);
      },
      (err: Error) => {
        if (cancelled) return;
        setChannelsError(err.message);
        setChannelsLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fetchChannels]);

  const selectedChannelIds = useMemo(
    () =>
      new Set(selected.filter((s) => s.kind === 'channel').map((s) => s.id)),
    [selected],
  );
  const selectedThreadIds = useMemo(
    () => new Set(selected.filter((s) => s.kind === 'thread').map((s) => s.id)),
    [selected],
  );
  const selectedFileIds = useMemo(
    () => new Set(selected.filter((s) => s.kind === 'file').map((s) => s.id)),
    [selected],
  );

  // Hydrate files + connector lookup when the Files tab is opened.
  // Channel-scoped attachment is the privacy boundary: when a
  // channelId is supplied we only load its attached files; otherwise
  // we fall back to every workspace connector.
  useEffect(() => {
    if (tab !== 'files') return;
    let cancelled = false;
    setFilesLoading(true);
    setFilesError(null);

    fetchWorkspaceConnectors(workspaceId)
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, Connector> = {};
        for (const c of list) map[c.id] = c;
        setConnectorsByID(map);
      })
      .catch(() => {
        if (!cancelled) setConnectorsByID({});
      });

    if (channelId) {
      fetchChannelFiles(channelId).then(
        (list) => {
          if (cancelled) return;
          setFiles(list);
          setFilesLoading(false);
        },
        (err: Error) => {
          if (cancelled) return;
          setFilesError(err.message);
          setFilesLoading(false);
        },
      );
    } else {
      // No channel scope — list every connector's files.
      fetchWorkspaceConnectors(workspaceId)
        .then(async (list) => {
          const all: ConnectorFile[] = [];
          for (const c of list) {
            try {
              const fs = await fetchConnectorFiles(c.id);
              all.push(...fs);
            } catch {
              /* skip */
            }
          }
          if (cancelled) return;
          setFiles(all);
          setFilesLoading(false);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setFilesError(err.message);
          setFilesLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [tab, channelId, workspaceId, fetchChannelFiles, fetchWorkspaceConnectors]);

  // When the user switches to the Threads tab or toggles a channel,
  // lazily hydrate threads for each selected channel.
  useEffect(() => {
    if (tab !== 'threads') return;
    const missing = [...selectedChannelIds].filter(
      (cid) => !(cid in threads) && !threadsLoading[cid],
    );
    if (missing.length === 0) return;
    for (const cid of missing) {
      setThreadsLoading((prev) => ({ ...prev, [cid]: true }));
      fetchThreads(cid).then(
        (list) => {
          setThreads((prev) => ({ ...prev, [cid]: list }));
          setThreadsLoading((prev) => ({ ...prev, [cid]: false }));
        },
        () => {
          setThreads((prev) => ({ ...prev, [cid]: [] }));
          setThreadsLoading((prev) => ({ ...prev, [cid]: false }));
        },
      );
    }
  }, [tab, selectedChannelIds, threads, threadsLoading, fetchThreads]);

  function toggle(source: SelectedSource) {
    setSelected((prev) => {
      const idx = prev.findIndex(
        (s) => s.kind === source.kind && s.id === source.id,
      );
      if (idx >= 0) {
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      }
      return [...prev, source];
    });
  }

  function removeSource(kind: SelectedSourceKind, id: string) {
    setSelected((prev) => prev.filter((s) => !(s.kind === kind && s.id === id)));
  }

  return (
    <section
      className="source-picker"
      data-testid="source-picker"
      aria-label="Select AI source context"
    >
      <header className="source-picker__header">
        <h3 className="source-picker__heading">Select sources</h3>
        <p className="source-picker__description">
          Scope which channels, threads, and files the AI Employee can read
          before running this action. Nothing is sent off-device.
        </p>
      </header>

      {selected.length > 0 && (
        <ul className="source-picker__chips" data-testid="source-picker-chips">
          {selected.map((s) => (
            <li
              key={`${s.kind}:${s.id}`}
              className={`source-picker__chip source-picker__chip--${s.kind}`}
              data-testid={`source-picker-chip-${s.kind}-${s.id}`}
            >
              <span className="source-picker__chip-kind">{s.kind}</span>
              <span className="source-picker__chip-name">
                {s.name}
                {s.kind === 'file' && s.connectorName && (
                  <span className="source-picker__chip-meta">
                    {' '}({s.connectorName})
                  </span>
                )}
              </span>
              <button
                type="button"
                className="source-picker__chip-remove"
                onClick={() => removeSource(s.kind, s.id)}
                data-testid={`source-picker-chip-remove-${s.kind}-${s.id}`}
                aria-label={`Remove ${s.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <nav className="source-picker__tabs" role="tablist">
        {(['channels', 'threads', 'files'] as TabId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`source-picker__tab${tab === id ? ' source-picker__tab--active' : ''}`}
            onClick={() => setTab(id)}
            data-testid={`source-picker-tab-${id}`}
          >
            {id === 'channels' ? 'Channels' : id === 'threads' ? 'Threads' : 'Files'}
          </button>
        ))}
      </nav>

      <div className="source-picker__body">
        {tab === 'channels' && (
          <div data-testid="source-picker-tab-body-channels">
            {channelsLoading && <p>Loading channels…</p>}
            {channelsError && (
              <p className="source-picker__error" role="alert">
                {channelsError}
              </p>
            )}
            {!channelsLoading && !channelsError && channels.length === 0 && (
              <p className="source-picker__empty">No channels in this workspace.</p>
            )}
            <ul className="source-picker__list">
              {channels.map((c) => {
                const checked = selectedChannelIds.has(c.id);
                return (
                  <li key={c.id} className="source-picker__row">
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggle({ kind: 'channel', id: c.id, name: c.name })
                        }
                        data-testid={`source-picker-channel-${c.id}`}
                      />
                      <span># {c.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === 'threads' && (
          <div data-testid="source-picker-tab-body-threads">
            {selectedChannelIds.size === 0 && (
              <p className="source-picker__empty">
                Pick a channel first to browse its threads.
              </p>
            )}
            {[...selectedChannelIds].map((cid) => {
              const ch = channels.find((c) => c.id === cid);
              const list = threads[cid] ?? [];
              const loading = threadsLoading[cid];
              return (
                <section
                  key={cid}
                  className="source-picker__thread-group"
                  data-testid={`source-picker-thread-group-${cid}`}
                >
                  <h4 className="source-picker__thread-heading">
                    # {ch?.name ?? cid}
                  </h4>
                  {loading && <p>Loading threads…</p>}
                  {!loading && list.length === 0 && (
                    <p className="source-picker__empty">No threads in this channel.</p>
                  )}
                  <ul className="source-picker__list">
                    {list.map((t) => {
                      const checked = selectedThreadIds.has(t.id);
                      return (
                        <li key={t.id} className="source-picker__row">
                          <label>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggle({
                                  kind: 'thread',
                                  id: t.id,
                                  name: t.title,
                                  parentChannelId: cid,
                                  parentChannelName: ch?.name,
                                })
                              }
                              data-testid={`source-picker-thread-${t.id}`}
                            />
                            <span>
                              {t.title}{' '}
                              <span className="source-picker__thread-meta">
                                ({t.messageCount} messages)
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {tab === 'files' && (
          <div data-testid="source-picker-tab-body-files">
            {filesLoading && <p>Loading files…</p>}
            {filesError && (
              <p className="source-picker__error" role="alert">
                {filesError}
              </p>
            )}
            {!filesLoading && !filesError && files.length === 0 && (
              <p className="source-picker__empty">
                {channelId
                  ? 'No connector files attached to this channel yet. Attach a connector from the right rail.'
                  : 'No connector files in this workspace.'}
              </p>
            )}
            <ul className="source-picker__list">
              {files.map((f) => {
                const checked = selectedFileIds.has(f.id);
                const connector = connectorsByID[f.connectorId];
                return (
                  <li key={f.id} className="source-picker__row">
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggle({
                            kind: 'file',
                            id: f.id,
                            name: f.name,
                            connectorId: f.connectorId,
                            connectorName: connector?.name,
                          })
                        }
                        data-testid={`source-picker-file-${f.id}`}
                      />
                      <span>
                        {f.name}{' '}
                        <span className="source-picker__file-meta">
                          ({connector?.name ?? f.connectorId})
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <footer className="source-picker__footer">
        <button
          type="button"
          className="source-picker__cancel"
          onClick={onCancel}
          data-testid="source-picker-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="source-picker__confirm"
          onClick={() => onSelect(selected)}
          data-testid="source-picker-confirm"
          disabled={selected.length === 0}
        >
          Use {selected.length} source{selected.length === 1 ? '' : 's'}
        </button>
      </footer>
    </section>
  );
}
