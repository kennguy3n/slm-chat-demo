import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchChats,
  fetchMe,
  fetchUsers,
  fetchWorkspaceChannels,
  fetchWorkspaces,
} from '../api/chatApi';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { User } from '../types/workspace';
import { TopBar } from './TopBar';
import { B2CLayout } from './B2CLayout';
import { B2BLayout } from './B2BLayout';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { MOBILE_BREAKPOINT, useMediaQuery } from './useMediaQuery';

const TAB_PLACEHOLDER: Record<Exclude<MobileTab, 'message'>, { title: string; body: string }> = {
  notification: {
    title: 'Notifications',
    body: 'AI-curated alerts land in Phase 2 — Phase 0 leaves this surface as a placeholder.',
  },
  tasks: {
    title: 'Tasks',
    body: 'A consolidated task inbox across chats lands in Phase 3.',
  },
  settings: {
    title: 'Settings',
    body: 'Privacy, AI compute mode, and account settings land in Phase 1+.',
  },
  more: {
    title: 'More',
    body: 'Artifacts, AI Employees, and Knowledge surfaces land in Phases 3–5.',
  },
};

// AppShell is the top-level component. It wraps the entire app, owns the
// top bar, and delegates the body to either B2CLayout or B2BLayout based on
// the context mode in the workspace store. On mobile (≤768 px) it switches
// to the single-column layout described in PROPOSAL.md section 4.2 and
// renders MobileTabBar with five tabs (Message / Notification / Tasks /
// Settings / More).
export function AppShell() {
  const { context, workspaceId, selectedChatId, setWorkspaceId } = useWorkspaceStore();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const [mobileTab, setMobileTab] = useState<MobileTab>('message');

  const meQ = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const wsQ = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces });
  const chatsQ = useQuery({
    queryKey: ['chats', context],
    queryFn: () => fetchChats(context),
  });

  const visibleWorkspaces = useMemo(
    () => (wsQ.data ?? []).filter((w) => w.context === context),
    [wsQ.data, context],
  );

  // Default workspace selection when context flips or workspace list changes.
  useEffect(() => {
    if (visibleWorkspaces.length === 0) {
      if (workspaceId !== null) setWorkspaceId(null);
      return;
    }
    const stillVisible = visibleWorkspaces.some((w) => w.id === workspaceId);
    if (!stillVisible) setWorkspaceId(visibleWorkspaces[0].id);
  }, [visibleWorkspaces, workspaceId, setWorkspaceId]);

  const channelsQ = useQuery({
    queryKey: ['workspace-channels', workspaceId, context],
    queryFn: () => fetchWorkspaceChannels(workspaceId!, context),
    enabled: !!workspaceId,
  });

  const users: Record<string, User> = useMemo(() => {
    const map: Record<string, User> = {};
    for (const u of usersQ.data ?? []) map[u.id] = u;
    if (meQ.data) map[meQ.data.id] = meQ.data;
    return map;
  }, [usersQ.data, meQ.data]);

  const activeWorkspace = visibleWorkspaces.find((w) => w.id === workspaceId);

  // Mobile message tab: show the chat list when no chat is selected, the
  // main chat when one is.
  const mobileView: 'list' | 'chat' = selectedChatId ? 'chat' : 'list';
  const showLayout = !isMobile || mobileTab === 'message';

  const layoutClassName = `layout-host${
    isMobile ? ` layout-host--mobile layout-host--mobile-${mobileView}` : ''
  }`;

  return (
    <div
      className="app-shell"
      data-testid="app-shell"
      data-context={context}
      data-mobile={isMobile ? 'true' : 'false'}
    >
      <TopBar workspaces={wsQ.data ?? []} />
      {showLayout ? (
        <div className={layoutClassName}>
          {context === 'b2c' ? (
            <B2CLayout chats={chatsQ.data ?? []} users={users} />
          ) : (
            <B2BLayout
              workspace={activeWorkspace}
              channels={channelsQ.data ?? []}
              users={users}
            />
          )}
        </div>
      ) : (
        <MobilePlaceholder tab={mobileTab as Exclude<MobileTab, 'message'>} />
      )}
      {isMobile && (
        <MobileTabBar
          active={mobileTab}
          onSelect={(t) => setMobileTab(t)}
        />
      )}
    </div>
  );
}

interface MobilePlaceholderProps {
  tab: Exclude<MobileTab, 'message'>;
}

function MobilePlaceholder({ tab }: MobilePlaceholderProps) {
  const data = TAB_PLACEHOLDER[tab];
  return (
    <section className="mobile-placeholder" data-testid={`mobile-placeholder-${tab}`}>
      <h2>{data.title}</h2>
      <p>{data.body}</p>
    </section>
  );
}
