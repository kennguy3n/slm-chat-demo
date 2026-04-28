import { useMemo } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User, Workspace } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';

interface Props {
  workspace?: Workspace;
  channels: Channel[];
  users: Record<string, User>;
}

// B2BLayout renders the workspace -> domain -> channel hierarchy in the sidebar
// (PROPOSAL.md section 4.1) plus the main chat and a thread placeholder right
// panel. Channels with no domain fall under a "Direct messages" section.
export function B2BLayout({ workspace, channels, users }: Props) {
  const { selectedChatId, setSelectedChatId } = useWorkspaceStore();

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

  const selected = channels.find((c) => c.id === selectedChatId) ?? null;

  return (
    <div className="layout layout--b2b" data-testid="b2b-layout">
      <aside className="sidebar" aria-label="B2B sidebar">
        <h2 className="sidebar__workspace">{workspace?.name ?? 'Workspace'}</h2>
        {workspace?.domains.map((d) => (
          <div className="sidebar__section" key={d.id}>
            <h3 className="sidebar__heading">{d.name}</h3>
            <ul className="sidebar__list">
              {(grouped.byDomain.get(d.id) ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`sidebar__item${c.id === selectedChatId ? ' sidebar__item--active' : ''}`}
                    onClick={() => setSelectedChatId(c.id)}
                  >
                    # {c.name}
                  </button>
                </li>
              ))}
            </ul>
            {!grouped.byDomain.get(d.id) && <p className="sidebar__empty">No channels</p>}
          </div>
        ))}
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
                    onClick={() => setSelectedChatId(c.id)}
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
        <ChatSurface channel={selected} users={users} />
      </main>

      <aside className="rightpanel" aria-label="Right panel">
        <DeviceCapabilityPanel />
        <div className="rightpanel__placeholder">Select a thread to view details</div>
      </aside>
    </div>
  );
}
