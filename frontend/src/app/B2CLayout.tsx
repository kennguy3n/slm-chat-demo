import { useMemo } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { MorningDigestPanel } from '../features/ai/MorningDigestPanel';

interface Props {
  chats: Channel[];
  users: Record<string, User>;
  // currentUserId enables SmartReplyBar by letting ChatSurface detect
  // the latest incoming message in the selected chat.
  currentUserId?: string;
}

// B2CLayout is the messaging-first consumer layout: a simpler sidebar showing
// personal DMs, family groups, and community groups, plus the main chat. It
// renders an empty right panel placeholder for thread/AI-output views that
// land in Phase 1+.
export function B2CLayout({ chats, users, currentUserId }: Props) {
  const { selectedChatId, setSelectedChatId } = useWorkspaceStore();

  const sections = useMemo(() => {
    return {
      personal: chats.filter((c) => c.kind === 'dm'),
      family: chats.filter((c) => c.kind === 'family'),
      community: chats.filter((c) => c.kind === 'community'),
    };
  }, [chats]);

  const selected = chats.find((c) => c.id === selectedChatId) ?? null;

  return (
    <div className="layout layout--b2c" data-testid="b2c-layout">
      <aside className="sidebar" aria-label="B2C sidebar">
        <SidebarSection
          title="Personal chats"
          chats={sections.personal}
          selectedId={selectedChatId}
          onSelect={setSelectedChatId}
          emptyLabel="No personal chats"
        />
        <SidebarSection
          title="Family groups"
          chats={sections.family}
          selectedId={selectedChatId}
          onSelect={setSelectedChatId}
          emptyLabel="No family groups"
        />
        <SidebarSection
          title="Community groups"
          chats={sections.community}
          selectedId={selectedChatId}
          onSelect={setSelectedChatId}
          emptyLabel="No community groups"
        />
      </aside>

      <main className="main" aria-label="Main chat">
        <ChatSurface channel={selected} users={users} currentUserId={currentUserId} />
      </main>

      <aside className="rightpanel" aria-label="Right panel">
        <DeviceCapabilityPanel />
        <MorningDigestPanel />
      </aside>
    </div>
  );
}

interface SidebarSectionProps {
  title: string;
  chats: Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyLabel: string;
}

function SidebarSection({ title, chats, selectedId, onSelect, emptyLabel }: SidebarSectionProps) {
  return (
    <div className="sidebar__section">
      <h3 className="sidebar__heading">{title}</h3>
      {chats.length === 0 ? (
        <p className="sidebar__empty">{emptyLabel}</p>
      ) : (
        <ul className="sidebar__list">
          {chats.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`sidebar__item${c.id === selectedId ? ' sidebar__item--active' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
