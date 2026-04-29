import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Channel, User, Workspace } from '../types/workspace';
import { ChatSurface } from '../features/chat/ChatSurface';
import { ThreadPanel } from '../features/chat/ThreadPanel';
import { DeviceCapabilityPanel } from '../features/ai/DeviceCapabilityPanel';
import { TasksKApp } from '../features/kapps/TasksKApp';
import { fetchAIEmployees } from '../api/aiEmployeeApi';
import type { AIEmployee } from '../types/aiEmployee';
import {
  AI_EMPLOYEE_RECIPES,
  AIEmployeeList,
  AIEmployeePanel,
} from '../features/ai-employees';
import { ConnectorPanel, KnowledgeGraphPanel } from '../features/knowledge';
import { PolicyAdminPanel } from '../features/ai/PolicyAdminPanel';


interface Props {
  workspace?: Workspace;
  channels: Channel[];
  users: Record<string, User>;
  // currentUserId is forwarded to ChatSurface so SmartReplyBar can
  // detect the latest *incoming* message correctly.
  currentUserId?: string;
}

type RightRailTab =
  | 'tasks'
  | 'ai-employees'
  | 'connectors'
  | 'knowledge'
  | 'policy';

const RIGHT_TABS: { id: RightRailTab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'ai-employees', label: 'AI Employees' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'policy', label: 'Policy' },
];

// B2BLayout renders the workspace -> domain -> channel hierarchy in the
// sidebar (PROPOSAL.md §4.1, Phase 3). Each domain is a collapsible
// section; channels with no domain fall under "Direct messages".
// Phase 3 added a "Tasks" right-panel tab that mounts TasksKApp.
// Phase 4 adds an "AI Employees" tab + a compact list of seeded
// employees under the channel tree.
export function B2BLayout({ workspace, channels, users, currentUserId }: Props) {
  const {
    selectedChatId,
    setSelectedChatId,
    selectedDomainId,
    setSelectedDomainId,
    expandedDomainIds,
    toggleDomainExpanded,
  } = useWorkspaceStore();

  const [rightTab, setRightTab] = useState<RightRailTab>('tasks');
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
          <div role="tabpanel" hidden={rightTab !== 'tasks'}>
            <TasksKApp channelId={selected?.id ?? null} />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'ai-employees'}>
            <AIEmployeePanel
              employee={selectedEmployee}
              channels={channels}
              recipeCatalog={AI_EMPLOYEE_RECIPES}
              onChange={handleEmployeeChange}
            />
          </div>
          <div role="tabpanel" hidden={rightTab !== 'connectors'}>
            {workspace && selected ? (
              <ConnectorPanel
                workspaceId={workspace.id}
                channelId={selected.id}
                channelName={selected.name}
              />
            ) : (
              <p className="connector-panel__empty">
                Select a channel to manage connectors.
              </p>
            )}
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
          <div role="tabpanel" hidden={rightTab !== 'policy'}>
            {workspace ? (
              <PolicyAdminPanel workspaceId={workspace.id} />
            ) : (
              <p className="policy-admin-panel__empty">
                Select a workspace to view its AI policy.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
