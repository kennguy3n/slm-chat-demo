import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { ThreadSummaryPanel } from '../ThreadSummaryPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as chatApi from '../../../api/chatApi';
import * as aiApi from '../../../api/aiApi';
import * as streamModule from '../../../api/streamAI';
import type { Channel } from '../../../types/workspace';
import type { Message } from '../../../types/chat';
import type { ThreadSummaryResponse } from '../../../types/ai';

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
    content: 'Need to lock vendor pricing for the Q3 logging contract.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'msg_vend_r1',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    senderId: 'user_eve',
    content: 'What are the bids?',
    createdAt: new Date().toISOString(),
  },
];

const fakeSummary: ThreadSummaryResponse = {
  prompt: 'Summarise…',
  threadId: 'msg_vend_root',
  channelId: 'ch_vendor_management',
  model: 'bonsai-1.7b',
  tier: 'local',
  reason: 'Routed to on-device Bonsai-1.7B.',
  messageCount: 2,
  sources: [
    {
      id: 'msg_vend_root',
      channelId: 'ch_vendor_management',
      sender: 'user_dave',
      excerpt: 'Need to lock vendor pricing…',
    },
  ],
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('ThreadSummaryPanel', () => {
  beforeEach(() => {
    vi.spyOn(chatApi, 'fetchChannelMessages').mockResolvedValue(messages);
    vi.spyOn(aiApi, 'fetchThreadSummary').mockResolvedValue(fakeSummary);
    vi.spyOn(streamModule, 'streamAITask').mockImplementation((_req, h) => {
      h.onChunk(
        'Acme Logs at $42k/yr was selected over BetterLog and CloudTrace.',
      );
      h.onDone?.();
      return new AbortController();
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-runs the summary on mount and renders the streamed body + privacy strip', async () => {
    renderWithProviders(<ThreadSummaryPanel channel={channel} />);
    await waitFor(() =>
      expect(screen.getByTestId('thread-summary-body')).toHaveTextContent(
        /Acme Logs at \$42k\/yr/,
      ),
    );
    expect(aiApi.fetchThreadSummary).toHaveBeenCalledWith({
      threadId: 'msg_vend_root',
    });
    // PrivacyStrip should render with on-device model details.
    const strip = screen.getByTestId('privacy-strip');
    expect(strip).toHaveTextContent(/on-device/i);
    expect(strip).toHaveTextContent(/bonsai-1\.7b/);
  });

  it('exposes an empty state when no channel is selected', () => {
    renderWithProviders(<ThreadSummaryPanel channel={null} />);
    expect(screen.getByTestId('thread-summary-panel')).toBeInTheDocument();
    expect(
      screen.getByText(/select a channel to summarise/i),
    ).toBeInTheDocument();
  });

  it('reuses the cached summary across remounts (per-channel cache)', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    const { unmount } = renderWithProviders(
      <ThreadSummaryPanel channel={channel} />,
      { client },
    );
    await waitFor(() =>
      expect(screen.getByTestId('thread-summary-body')).toHaveTextContent(
        /Acme Logs/,
      ),
    );
    expect(aiApi.fetchThreadSummary).toHaveBeenCalledTimes(1);
    unmount();

    // Remount on the same channel: should replay the cached output
    // without running inference again.
    renderWithProviders(<ThreadSummaryPanel channel={channel} />, { client });
    expect(screen.getByTestId('thread-summary-body')).toHaveTextContent(
      /Acme Logs/,
    );
    expect(aiApi.fetchThreadSummary).toHaveBeenCalledTimes(1);
  });

  it('re-runs inference when the user clicks the refresh button', async () => {
    renderWithProviders(<ThreadSummaryPanel channel={channel} />);
    await waitFor(() =>
      expect(screen.getByTestId('thread-summary-body')).toHaveTextContent(
        /Acme Logs/,
      ),
    );
    await userEvent.click(screen.getByTestId('thread-summary-panel-run'));
    await waitFor(() =>
      expect(aiApi.fetchThreadSummary).toHaveBeenCalledTimes(2),
    );
  });

  it('surfaces a thread-fetch error in an alert', async () => {
    vi.spyOn(chatApi, 'fetchChannelMessages').mockReset();
    vi.spyOn(chatApi, 'fetchChannelMessages').mockRejectedValue(
      new Error('thread fetch failed'),
    );
    renderWithProviders(<ThreadSummaryPanel channel={channel} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/thread fetch failed/),
    );
  });
});
