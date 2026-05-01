import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThreadTasksPanel } from '../ThreadTasksPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as chatApi from '../../../api/chatApi';
import * as kappsApi from '../../../api/kappsApi';
import type { Channel } from '../../../types/workspace';
import type { Message } from '../../../types/chat';
import type { KAppsExtractTasksResponse } from '../../../types/ai';

const channel: Channel = {
  id: 'ch_vendor_management',
  workspaceId: 'ws_acme',
  name: 'vendor-management',
  kind: 'channel',
  context: 'b2b',
  memberIds: ['user_alice'],
};

const messages: Message[] = [
  {
    id: 'msg_vend_root',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    senderId: 'user_dave',
    content: 'Need to lock vendor pricing for Q3 logging.',
    createdAt: new Date().toISOString(),
  },
];

const fakeTasks: KAppsExtractTasksResponse = {
  threadId: 'msg_vend_root',
  channelId: 'ch_vendor_management',
  model: 'bonsai-1.7b',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
  tasks: [
    {
      title: 'File the Acme Logs approval',
      owner: 'user_dave',
      dueDate: '2026-05-04',
      status: 'open',
      sourceMessageId: 'msg_vend_r10',
    },
    {
      title: 'Request us-west-2 replica from Acme',
      owner: 'user_alice',
      status: 'open',
      sourceMessageId: 'msg_vend_r11',
    },
  ],
};

describe('ThreadTasksPanel', () => {
  beforeEach(() => {
    vi.spyOn(chatApi, 'fetchChannelMessages').mockResolvedValue(messages);
    vi.spyOn(kappsApi, 'extractKAppTasks').mockResolvedValue(fakeTasks);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-extracts tasks for the active channel and renders them with a privacy strip', async () => {
    renderWithProviders(<ThreadTasksPanel channel={channel} />);
    await waitFor(() =>
      expect(screen.getByTestId('task-extraction-card')).toBeInTheDocument(),
    );
    expect(kappsApi.extractKAppTasks).toHaveBeenCalledWith({
      threadId: 'msg_vend_root',
    });
    // Open the badge to surface the rendered tasks.
    await userEvent.click(screen.getByTestId('task-extraction-badge'));
    expect(screen.getAllByTestId(/task-extraction-item-/)).toHaveLength(2);
    const strip = screen.getByTestId('privacy-strip');
    expect(strip).toHaveTextContent(/on-device/i);
    expect(strip).toHaveTextContent(/bonsai-1\.7b/);
  });

  it('renders an empty-channel placeholder when no channel is selected', () => {
    renderWithProviders(<ThreadTasksPanel channel={null} />);
    expect(screen.getByTestId('thread-tasks-panel')).toBeInTheDocument();
    expect(
      screen.getByText(/select a channel to extract tasks/i),
    ).toBeInTheDocument();
  });

  it('caches the extraction per channel across remounts', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    const { unmount } = renderWithProviders(
      <ThreadTasksPanel channel={channel} />,
      { client },
    );
    await waitFor(() =>
      expect(screen.getByTestId('task-extraction-card')).toBeInTheDocument(),
    );
    expect(kappsApi.extractKAppTasks).toHaveBeenCalledTimes(1);
    unmount();

    renderWithProviders(<ThreadTasksPanel channel={channel} />, { client });
    expect(screen.getByTestId('task-extraction-card')).toBeInTheDocument();
    // Cache hit — no second inference run.
    expect(kappsApi.extractKAppTasks).toHaveBeenCalledTimes(1);
  });

  it('surfaces extraction errors in an alert', async () => {
    vi.spyOn(kappsApi, 'extractKAppTasks').mockReset();
    vi.spyOn(kappsApi, 'extractKAppTasks').mockRejectedValue(
      new Error('extraction crashed'),
    );
    renderWithProviders(<ThreadTasksPanel channel={channel} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/extraction crashed/),
    );
  });

  // Regression: a mid-flight channel switch must not fire `extractKAppTasks`
  // for the abandoned channel. The inference router runs --parallel 1, so a
  // stale on-device LLM call serially blocks the new channel's extraction
  // for several seconds before the post-call run-id check discards it.
  it('aborts the in-flight run when the channel changes between fetchChannelMessages and extractKAppTasks', async () => {
    const channelA: Channel = {
      id: 'ch_a',
      workspaceId: 'ws_acme',
      name: 'a',
      kind: 'channel',
      context: 'b2b',
      memberIds: [],
    };
    const channelB: Channel = {
      ...channelA,
      id: 'ch_b',
      name: 'b',
    };
    const messagesA: Message[] = [
      {
        id: 'msg_a',
        channelId: 'ch_a',
        threadId: 'msg_a',
        senderId: 'u',
        content: 'a',
        createdAt: new Date().toISOString(),
      },
    ];
    const messagesB: Message[] = [
      {
        id: 'msg_b',
        channelId: 'ch_b',
        threadId: 'msg_b',
        senderId: 'u',
        content: 'b',
        createdAt: new Date().toISOString(),
      },
    ];

    // Pin channel A's fetch so we can hold it open across the channel switch.
    let resolveA: (m: Message[]) => void = () => {};
    const aPromise = new Promise<Message[]>((r) => {
      resolveA = r;
    });

    vi.spyOn(chatApi, 'fetchChannelMessages').mockReset();
    vi.spyOn(chatApi, 'fetchChannelMessages').mockImplementation((id: string) => {
      if (id === 'ch_a') return aPromise;
      if (id === 'ch_b') return Promise.resolve(messagesB);
      return Promise.resolve([]);
    });
    vi.spyOn(kappsApi, 'extractKAppTasks').mockReset();
    vi.spyOn(kappsApi, 'extractKAppTasks').mockResolvedValue(fakeTasks);

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <ThreadTasksPanel channel={channelA} />
      </QueryClientProvider>,
    );

    // Switch to B before A's fetchChannelMessages resolves.
    rerender(
      <QueryClientProvider client={client}>
        <ThreadTasksPanel channel={channelB} />
      </QueryClientProvider>,
    );

    // B's run completes — its extraction lands.
    await waitFor(() =>
      expect(screen.getByTestId('task-extraction-card')).toBeInTheDocument(),
    );

    // Now release A's slow fetch. The runIdRef guard must short-circuit the
    // continuation before extractKAppTasks is invoked for A.
    resolveA(messagesA);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const calls = (kappsApi.extractKAppTasks as unknown as {
      mock: { calls: [{ threadId: string }][] };
    }).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ threadId: 'msg_b' });
  });
});
