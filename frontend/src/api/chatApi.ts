import { apiFetch } from './client';
import type { Channel, ContextMode, User, Workspace } from '../types/workspace';
import type { Message } from '../types/chat';

export async function fetchMe(): Promise<User> {
  return apiFetch<User>('/api/users/me');
}

export async function fetchChats(context?: ContextMode): Promise<Channel[]> {
  const qs = context ? `?context=${context}` : '';
  const data = await apiFetch<{ chats: Channel[] }>(`/api/chats${qs}`);
  return data.chats;
}

export async function fetchChannelMessages(chatId: string): Promise<Message[]> {
  const data = await apiFetch<{ messages: Message[] }>(`/api/chats/${chatId}/messages`);
  return data.messages;
}

export async function fetchThreadMessages(threadId: string): Promise<Message[]> {
  const data = await apiFetch<{ messages: Message[] }>(`/api/threads/${threadId}/messages`);
  return data.messages;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const data = await apiFetch<{ workspaces: Workspace[] }>('/api/workspaces');
  return data.workspaces;
}

export async function fetchWorkspaceChannels(
  workspaceId: string,
  context?: ContextMode,
): Promise<Channel[]> {
  const qs = context ? `?context=${context}` : '';
  const data = await apiFetch<{ channels: Channel[] }>(
    `/api/workspaces/${workspaceId}/channels${qs}`,
  );
  return data.channels;
}
