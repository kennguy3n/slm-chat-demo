import { useEffect, useMemo } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User, Workspace } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { ThreadPanel } from '../features/chat/ThreadPanel';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { TasksKApp } from '../features/kapps/TasksKApp';


interface Props {
  workspace?: Workspace;
  channels: Channel[];
  users: Record<string, User>;
  // currentUserId is forwarded to ChatSurface so SmartReplyBar can
  // detect the latest *incoming* message correctly.
  currentUserId?: string;
}

// B2BLayout renders the workspace -> domain -> channel hierarchy in the
// sidebar (PROPOSAL.md §4.1, Phase 3). Each domain is a collapsible
// section; channels with no domain fall under "Direct messages".
// Phase 3 added a "Tasks" right-panel tab that mounts TasksKApp.
export function B2BLayout({ workspace, channels, users, currentUserId }: Props) {
  const {
    selectedChatId,
    setSelectedChatId,
    selectedDomainId,
    setSelectedDomainId,
    expandedDomainIds,
    toggleDomainExpanded,
  } = useWorkspaceStore();

  const grouped = useMemo(() => {
    const byDomain = new Map<string, Channel[]>();
    const dms: Channel[] = [];
    for (const c of channels) {
      if (c.kind === 'dm') {
        dms.push(c);
        continue;
      }
      const key = c.domainId ?? '_none_';
      byDomain.set(key, [...(byDomain.get(key) ?? []), c]);
    }
    return { byDomain, dms };
  }, [channels]);

  // Auto-expand every domain on first mount so demo users always see
  // the full tree. Honours user collapses afterwards because the store
  // tracks expansion state explicitly.
  useEffect(() => {
    if (!workspace) return;
    if (expandedDomainIds.length > 0) return;
    for (const d of workspace.domains) {
      if (!expandedDomainIds.includes(d.id)) {
        toggleDomainExpanded(d.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  const selected = channels.find((c) => c.id === selectedChatId) ?? null;

  // Clicking a channel sets the chat AND selects its parent domain so
  // the right-panel "Tasks" tab can default to that scope.
  function handleChannelClick(c: Channel) {
    setSelectedChatId(c.id);
    if (c.domainId) setSelectedDomainId(c.domainId);
  }

  return (
    <div className="layout layout--b2b" data-testid="b2b-layout">
      <aside className="sidebar" aria-label="B2B sidebar">
        <h2 className="sidebar__workspace">{workspace?.name ?? 'Workspace'}</h2>
        {workspace?.domains.map((d) => {
          const expanded = expandedDomainIds.includes(d.id);
          const domainChannels = grouped.byDomain.get(d.id) ?? [];
          return (
            <div className="sidebar__section" key={d.id} data-testid={`sidebar-domain-${d.id}`}>
              <h3
                className={`sidebar__heading${
                  d.id === selectedDomainId ? ' sidebar__heading--active' : ''
                }`}
              >
                <button
                  type="button"
                  className="sidebar__heading-toggle"
                  aria-expanded={expanded}
                  aria-controls={`sidebar-domain-${d.id}-list`}
                  onClick={() => {
                    toggleDomainExpanded(d.id);
                    setSelectedDomainId(d.id);
                  }}
                  data-testid={`sidebar-domain-toggle-${d.id}`}
                >
                  <span aria-hidden className="sidebar__chevron">
                    {expanded ? '▾' : '▸'}
                  </span>
                  {d.name}
                </button>
              </h3>
              {expanded && (
                <ul className="sidebar__list" id={`sidebar-domain-${d.id}-list`}>
                  {domainChannels.length === 0 && (
                    <li>
                      <p className="sidebar__empty">No channels</p>
                    </li>
                  )}
                  {domainChannels.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`sidebar__item${c.id === selectedChatId ? ' sidebar__item--active' : ''}`}
                        onClick={() => handleChannelClick(c)}
                      >
                        # {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <div className="sidebar__section">
          <h3 className="sidebar__heading">Direct messages</h3>
          {grouped.dms.length === 0 ? (
            <p className="sidebar__empty">No DMs</p>
          ) : (
            <ul className="sidebar__list">
              {grouped.dms.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`sidebar__item${c.id === selectedChatId ? ' sidebar__item--active' : ''}`}
                    onClick={() => handleChannelClick(c)}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="main" aria-label="Main chat">
        <ChatSurface channel={selected} users={users} currentUserId={currentUserId} />
      </main>

      <aside className="rightpanel" aria-label="Right panel">
        <DeviceCapabilityPanel />
        <ThreadPanel channel={selected} />
        <TasksKApp channelId={selected?.id ?? null} />
      </aside>
    </div>
  );
}
