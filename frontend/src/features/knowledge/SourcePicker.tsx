import { useEffect, useMemo, useState } from 'react';
import type { Channel } from '../../types/workspace';
import type {
  SelectedSource,
  SelectedSourceKind,
  ThreadSummary,
} from '../../types/knowledge';
import { fetchWorkspaceChannels, fetchChannelMessages } from '../../api/chatApi';

type TabId = 'channels' | 'threads' | 'files';

interface Props {
  workspaceId: string;
  // initial sources preselected (e.g. when re-opening the picker
  // after the user already picked something). Defaults to [].
  initialSelected?: SelectedSource[];
  onSelect: (sources: SelectedSource[]) => void;
  onCancel: () => void;
  // Test seam — lets the picker tests stub the network layer without
  // intercepting global fetch.
  api?: {
    fetchWorkspaceChannels?: (workspaceId: string) => Promise<Channel[]>;
    fetchChannelThreads?: (channelId: string) => Promise<ThreadSummary[]>;
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
// Phase 5 kickoff: only channels + threads are wired; the Files tab
// reads "Coming soon" since connectors (Drive, GitHub, etc.) are on
// the Phase 5 backlog.
export function SourcePicker({
  workspaceId,
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
              <span className="source-picker__chip-name">{s.name}</span>
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
          <div
            data-testid="source-picker-tab-body-files"
            className="source-picker__coming-soon"
          >
            <p>
              Files — coming soon. Phase 5 will wire in Drive, GitHub, and
              local-file connectors so AI Employees can read attached files
              with the same per-source consent as messages.
            </p>
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
