import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User, Workspace } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { ThreadPanel } from '../features/chat/ThreadPanel';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { ThreadSummaryPanel } from '../features/ai/ThreadSummaryPanel';
import { ThreadTasksPanel } from '../features/ai/ThreadTasksPanel';
import { fetchAIEmployees } from '../api/aiEmployeeApi';
import type { AIEmployee } from '../types/aiEmployee';
import {
  AI_EMPLOYEE_RECIPES,
  AIEmployeeList,
  AIEmployeePanel,
} from '../features/ai-employees';
import { KnowledgeGraphPanel } from '../features/knowledge';


interface Props {
  workspace?: Workspace;
  channels: Channel[];
  users: Record<string, User>;
  // currentUserId is forwarded to ChatSurface so SmartReplyBar can
  // detect the latest *incoming* message correctly.
  currentUserId?: string;
}

type RightRailTab = 'summary' | 'tasks' | 'knowledge' | 'ai-employees';

const RIGHT_TABS: { id: RightRailTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'ai-employees', label: 'AI Employees' },
];

// The B2B redesign opens on the vendor-management thread because
// it has the longest seeded conversation, the richest decision
// content, and is the canonical surface for the approval-prefill
// demo flow (PROPOSAL.md §5.3).
const DEFAULT_B2B_CHANNEL_ID = 'ch_vendor_management';

// B2BLayout renders the workspace -> domain -> channel hierarchy in
// the sidebar (PROPOSAL.md §4.1, Phase 3). The Phase 9 ground-zero
// LLM redesign collapsed the right-rail to four tabs that all run
// real on-device inference:
//
//   - Summary  → ThreadSummaryPanel (ai:summarize-thread)
//   - Tasks    → ThreadTasksPanel   (ai:kapps-extract-tasks)
//   - Knowledge → KnowledgeGraphPanel (ai:extract-knowledge)
//   - AI Employees → AIEmployeePanel (recipe runs hit the LLM)
//
// The previous Connectors / Policy tabs were removed from the
// primary right-rail because they were CRUD over seeded data and
// did not exercise the on-device LLM. Their components still live
// under `features/knowledge/ConnectorPanel.tsx` and
// `features/ai/PolicyAdminPanel.tsx` and can be re-mounted from a
// dedicated admin surface when needed.
export function B2BLayout({ workspace, channels, users, currentUserId }: Props) {
  const {
    selectedChatId,
    setSelectedChatId,
    selectedDomainId,
    setSelectedDomainId,
    expandedDomainIds,
    toggleDomainExpanded,
  } = useWorkspaceStore();

  const [rightTab, setRightTab] = useState<RightRailTab>('summary');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const aiEmployeesQ = useQuery({
    queryKey: ['ai-employees'],
    queryFn: fetchAIEmployees,
  });
  const aiEmployees = useMemo(
    () => aiEmployeesQ.data ?? [],
    [aiEmployeesQ.data],
  );

  useEffect(() => {
    if (selectedEmployeeId) return;
    if (aiEmployees.length === 0) return;
    setSelectedEmployeeId(aiEmployees[0].id);
  }, [aiEmployees, selectedEmployeeId]);

  const selectedEmployee =
    aiEmployees.find((e) => e.id === selectedEmployeeId) ?? null;

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

  // Auto-select the vendor-management channel on first mount so the
  // demo opens on the headline B2B scenario (rich seeded thread →
  // real on-device summary + task extraction). Only fires when
  // nothing else is selected and the channel actually exists.
  useEffect(() => {
    if (selectedChatId) return;
    const target = channels.find((c) => c.id === DEFAULT_B2B_CHANNEL_ID);
    if (target) {
      setSelectedChatId(target.id);
      if (target.domainId) setSelectedDomainId(target.domainId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  const selected = channels.find((c) => c.id === selectedChatId) ?? null;

  // Clicking a channel sets the chat AND selects its parent domain so
  // the right-panel "Tasks" tab can default to that scope.
  function handleChannelClick(c: Channel) {
    setSelectedChatId(c.id);
    if (c.domainId) setSelectedDomainId(c.domainId);
  }

  function handleEmployeeChange(updated: AIEmployee) {
    // Optimistically update the cached list so both the sidebar cards
    // and the right-rail panel reflect the pending channel/recipe edit
    // before the refetch settles.
    queryClient.setQueryData<AIEmployee[]>(
      ['ai-employees'],
      (prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? [updated],
    );
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
        <AIEmployeeList
          employees={aiEmployees}
          selectedId={selectedEmployeeId}
          onSelect={(id) => {
            setSelectedEmployeeId(id);
            setRightTab('ai-employees');
          }}
        />
      </aside>

      <main className="main" aria-label="Main chat">
        <ChatSurface channel={selected} users={users} currentUserId={currentUserId} />
      </main>

      <aside className="rightpanel" aria-label="Right panel">
        <DeviceCapabilityPanel />
        <ThreadPanel channel={selected} />
        <nav
          className="rightpanel__tabs"
          role="tablist"
          aria-label="B2B right rail"
          data-testid="b2b-right-tabs"
        >
          {RIGHT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={rightTab === t.id}
              className={
                'rightpanel__tab' + (rightTab === t.id ? ' rightpanel__tab--active' : '')
              }
              onClick={() => setRightTab(t.id)}
              data-testid={`b2b-right-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="rightpanel__body" data-testid={`b2b-right-body-${rightTab}`}>
          {/*
           * All panels stay mounted with `hidden` so that user-curated
           * state (a streamed summary, an extracted task list) survives
           * a tab switch without re-running on-device inference.
           */}
          <div role="tabpanel" hidden={rightTab !== 'summary'}>
            <ThreadSummaryPanel channel={selected} />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'tasks'}>
            <ThreadTasksPanel channel={selected} />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'knowledge'}>
            {selected ? (
              <KnowledgeGraphPanel
                channelId={selected.id}
                channelName={selected.name}
              />
            ) : (
              <p className="knowledge-graph-panel__empty">
                Select a channel to view its knowledge graph.
              </p>
            )}
          </div>
          <div role="tabpanel" hidden={rightTab !== 'ai-employees'}>
            <AIEmployeePanel
              employee={selectedEmployee}
              channels={channels}
              recipeCatalog={AI_EMPLOYEE_RECIPES}
              onChange={handleEmployeeChange}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
