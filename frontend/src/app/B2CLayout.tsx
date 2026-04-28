import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { MorningDigestPanel } from '../features/ai/MorningDigestPanel';
import { FamilyChecklistCard } from '../features/ai/FamilyChecklistCard';
import { ShoppingNudgesPanel } from '../features/ai/ShoppingNudgesPanel';
import { EventRSVPCard } from '../features/ai/EventRSVPCard';
import { TripPlannerCard } from '../features/ai/TripPlannerCard';
import { MetricsDashboard } from '../features/ai/MetricsDashboard';
import { AIMemoryPage } from '../features/memory/AIMemoryPage';

interface Props {
  chats: Channel[];
  users: Record<string, User>;
  // currentUserId enables SmartReplyBar by letting ChatSurface detect
  // the latest incoming message in the selected chat.
  currentUserId?: string;
}

type RightPanelTab =
  | 'digest'
  | 'family'
  | 'shopping'
  | 'events'
  | 'trip'
  | 'memory'
  | 'stats';

const RIGHT_TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'digest', label: 'Digest' },
  { id: 'family', label: 'Family' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'events', label: 'Events' },
  { id: 'trip', label: 'Trip' },
  { id: 'memory', label: 'Memory' },
  { id: 'stats', label: 'Stats' },
];

// B2CLayout is the messaging-first consumer layout: a simpler sidebar showing
// personal DMs, family groups, and community groups, plus the main chat. The
// right rail tabs through the B2C "second brain" surfaces (Phase 2): catch-up
// digest, family checklist, shopping nudges, community RSVPs, and the local
// AI Memory index.
export function B2CLayout({ chats, users, currentUserId }: Props) {
  const { selectedChatId, setSelectedChatId } = useWorkspaceStore();
  const [rightTab, setRightTab] = useState<RightPanelTab>('digest');

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
        <nav
          className="rightpanel__tabs"
          role="tablist"
          aria-label="Second brain"
          data-testid="b2c-right-tabs"
        >
          {RIGHT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={rightTab === t.id}
              className={
                'rightpanel__tab' +
                (rightTab === t.id ? ' rightpanel__tab--active' : '')
              }
              onClick={() => setRightTab(t.id)}
              data-testid={`b2c-right-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="rightpanel__body" data-testid={`b2c-right-body-${rightTab}`}>
          {/*
           * All panels stay mounted; we hide inactive ones with `hidden` so
           * that user-curated state (the local shopping list, RSVP picks,
           * generated checklist / digest) survives a tab switch instead of
           * being thrown away by an unmount.
           */}
          <div role="tabpanel" hidden={rightTab !== 'digest'}>
            <MorningDigestPanel />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'family'}>
            <FamilyChecklistCard
              channelId={selected?.id ?? null}
              channelName={selected?.name}
            />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'shopping'}>
            <ShoppingNudgesPanel
              channelId={selected?.id ?? null}
              channelName={selected?.name}
            />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'events'}>
            <EventRSVPCard
              channelId={selected?.id ?? null}
              channelName={selected?.name}
            />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'trip'}>
            <TripPlannerCard />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'memory'}>
            <AIMemoryPage />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'stats'}>
            <MetricsDashboard />
          </div>
        </div>
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
