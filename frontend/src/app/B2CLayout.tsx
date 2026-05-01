import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { ConversationInsightsPanel } from '../features/ai/ConversationInsightsPanel';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { MorningDigestPanel } from '../features/ai/MorningDigestPanel';
import { MetricsDashboard } from '../features/ai/MetricsDashboard';

interface Props {
  chats: Channel[];
  users: Record<string, User>;
  // currentUserId enables SmartReplyBar by letting ChatSurface detect
  // the latest incoming message in the selected chat.
  currentUserId?: string;
}

type RightPanelTab = 'summary' | 'insights' | 'stats';

const RIGHT_TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'insights', label: 'Insights' },
  { id: 'stats', label: 'Stats' },
];

// The default channel auto-selected on first mount when nothing is
// selected yet. The bilingual Alice ↔ Minh DM is the centrepiece of
// the redesigned B2C demo (English ↔ Vietnamese with on-device
// translation on every bubble).
const DEFAULT_B2C_CHANNEL_ID = 'ch_dm_alice_minh';

// B2CLayout is the messaging-first consumer surface, redesigned in
// the 2026-05-01 ground-zero LLM pass to exercise the on-device
// model on every visible affordance:
//
//   • Per-bubble translation (TranslationCaption)
//   • Smart-reply suggestions (SmartReplyBar)
//   • Task extraction over chat messages (TaskExtractionCard)
//   • Conversation summary (Summary tab → MorningDigestPanel)
//   • Conversation insights — topics/action items/decisions/sentiment
//     (Insights tab → ConversationInsightsPanel)
//   • Real LLM usage metrics (Stats tab → MetricsDashboard)
//
// The earlier family / shopping / event / trip-planner panels were
// removed because they were anchored to MockAdapter seed data rather
// than real local inference.
export function B2CLayout({ chats, users, currentUserId }: Props) {
  const { selectedChatId, setSelectedChatId } = useWorkspaceStore();
  const [rightTab, setRightTab] = useState<RightPanelTab>('summary');

  // Single-section sidebar: every B2C demo flow now anchors on the
  // bilingual DM, so the layout no longer carves out separate Family
  // / Community sections (those were tied to seeded channels that
  // existed only to back mock-driven cards).
  const personalChats = useMemo(
    () => chats.filter((c) => c.kind === 'dm'),
    [chats],
  );

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
          chats={personalChats}
          selectedId={selectedChatId}
          onSelect={setSelectedChatId}
          emptyLabel="No personal chats"
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
          aria-label="On-device LLM panels"
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
           * that user-curated state (generated summary, generated insights)
           * survives a tab switch instead of being thrown away by an
           * unmount.
           */}
          <div role="tabpanel" hidden={rightTab !== 'summary'}>
            <MorningDigestPanel
              channel={selected}
              users={users}
            />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'insights'}>
            <ConversationInsightsPanel channel={selected} users={users} />
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
