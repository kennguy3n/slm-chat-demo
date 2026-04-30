import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { MorningDigestPanel } from '../features/ai/MorningDigestPanel';
import { MetricsDashboard } from '../features/ai/MetricsDashboard';
import { AIMemoryPage } from '../features/memory/AIMemoryPage';

interface Props {
  chats: Channel[];
  users: Record<string, User>;
  // currentUserId enables SmartReplyBar by letting ChatSurface detect
  // the latest incoming message in the selected chat.
  currentUserId?: string;
}

type RightPanelTab = 'summary' | 'memory' | 'stats';

const RIGHT_TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'memory', label: 'Memory' },
  { id: 'stats', label: 'Stats' },
];

// The default channel auto-selected on first mount when nothing is
// selected yet. The bilingual Alice ↔ Minh DM is the centrepiece of
// the redesigned B2C demo (English ↔ Vietnamese with on-device
// translation on every bubble).
const DEFAULT_B2C_CHANNEL_ID = 'ch_dm_alice_minh';

// B2CLayout is the messaging-first consumer layout. The redesigned
// right rail focuses on surfaces that exercise the on-device LLM:
// a bilingual conversation summary, the local-only AI Memory page,
// and the on-device metrics dashboard. Family / shopping / events /
// trip panels lived here in earlier phases but were removed because
// they relied on canned MockAdapter outputs rather than real local
// inference.
export function B2CLayout({ chats, users, currentUserId }: Props) {
  const { selectedChatId, setSelectedChatId } = useWorkspaceStore();
  const [rightTab, setRightTab] = useState<RightPanelTab>('summary');

  const sections = useMemo(() => {
    return {
      personal: chats.filter((c) => c.kind === 'dm'),
      family: chats.filter((c) => c.kind === 'family'),
      community: chats.filter((c) => c.kind === 'community'),
    };
  }, [chats]);

  // Auto-select the bilingual DM on first mount so the demo opens on
  // the headline scenario. Only fires when nothing else is selected
  // and the channel actually exists in the seed data.
  useEffect(() => {
    if (selectedChatId) return;
    const target = chats.find((c) => c.id === DEFAULT_B2C_CHANNEL_ID);
    if (target) {
      setSelectedChatId(target.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
           * that user-curated state (memory facts, generated summary)
           * survives a tab switch instead of being thrown away by an
           * unmount.
           */}
          <div role="tabpanel" hidden={rightTab !== 'summary'}>
            <MorningDigestPanel
              channel={selected}
              users={users}
            />
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
