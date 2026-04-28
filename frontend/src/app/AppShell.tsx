import { useEffect, useMemo } from 'react';
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

// AppShell is the top-level component. It wraps the entire app, owns the
// top bar, and delegates the body to either B2CLayout or B2BLayout based on
// the context mode in the workspace store.
export function AppShell() {
  const { context, workspaceId, setWorkspaceId } = useWorkspaceStore();

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

  return (
    <div className="app-shell" data-testid="app-shell" data-context={context}>
      <TopBar workspaces={wsQ.data ?? []} />
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
  );
}
