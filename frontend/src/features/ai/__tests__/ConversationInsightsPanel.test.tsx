import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationInsightsPanel, computeInsightsConfidence } from '../ConversationInsightsPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as aiApi from '../../../api/aiApi';
import type { ConversationInsightsResponse } from '../../../types/ai';
import type { Channel } from '../../../types/workspace';

const channelA: Channel = {
  id: 'ch_dm_alice_minh',
  workspaceId: 'w_personal',
  name: 'Minh Nguyen',
  kind: 'dm',
  context: 'b2c',
  memberIds: ['user_alice', 'user_minh'],
  partnerLanguage: 'Vietnamese',
};

const channelB: Channel = {
  id: 'ch_dm_alice_other',
  workspaceId: 'w_personal',
  name: 'Other DM',
  kind: 'dm',
  context: 'b2c',
  memberIds: ['user_alice', 'user_other'],
};

function makeInsights(channelId: string, label: string): ConversationInsightsResponse {
  return {
    channelId,
    topics: [{ label }],
    actionItems: [],
    decisions: [],
    sentiment: 'neutral',
    sourceMessageIds: [],
    model: 'bonsai-1.7b',
    tier: 'local',
    reason: 'On-device LLM extracted insights.',
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

describe('ConversationInsightsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-runs the insights fetch on mount and renders the topics', async () => {
    vi.spyOn(aiApi, 'fetchConversationInsights').mockResolvedValue(
      makeInsights(channelA.id, 'phở'),
    );
    renderWithProviders(<ConversationInsightsPanel channel={channelA} />);
    await waitFor(() =>
      expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('phở'),
    );
  });

  it('drops a stale in-flight fetch when the user switches channels and the new channel has cached insights', async () => {
    // Pre-cache channel B's insights so the panel will take the cached path
    // when the user switches to it.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    client.setQueryData(['conversation-insights', channelB.id], {
      insights: makeInsights(channelB.id, 'B-topic'),
      generatedAt: new Date().toISOString(),
    });

    // Channel A's fetch never resolves until we say so — simulating a slow LLM
    // generation that the user has navigated away from.
    let releaseA: (value: ConversationInsightsResponse) => void = () => {};
    const slowA = new Promise<ConversationInsightsResponse>((resolve) => {
      releaseA = resolve;
    });
    const spy = vi.spyOn(aiApi, 'fetchConversationInsights').mockReturnValue(slowA);

    const { rerender } = renderWithProviders(
      <ConversationInsightsPanel channel={channelA} />,
      { client },
    );

    // While A's fetch is pending the panel should be in the analysing state
    // (no topics yet).
    expect(screen.queryByTestId('conversation-insights-topic')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);

    // User switches to channel B. The panel takes the cached path and
    // bumps the run id so A's pending promise will be ignored when it
    // eventually resolves. `rerender` from the bare render() does not
    // re-apply our explicit provider wrap, so we re-wrap manually here.
    rerender(
      <QueryClientProvider client={client}>
        <ConversationInsightsPanel channel={channelB} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('B-topic'),
    );

    // Now the slow A response arrives. With the runIdRef bump on the
    // cached path it must NOT clobber B's rendered topics.
    releaseA(makeInsights(channelA.id, 'A-topic'));
    // Give microtasks a chance to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('B-topic');
    expect(screen.queryByText('A-topic')).toBeNull();
  });

  it('shows an error alert when the auto-run fetch rejects', async () => {
    vi.spyOn(aiApi, 'fetchConversationInsights').mockRejectedValue(new Error('boom'));
    renderWithProviders(<ConversationInsightsPanel channel={channelA} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
  });

  it("clears the previous channel's insights when the new channel's manual run fails", async () => {
    // First render: channel A succeeds and the panel pins A's topics.
    const aResponse = makeInsights(channelA.id, 'A-topic');
    const fetchSpy = vi
      .spyOn(aiApi, 'fetchConversationInsights')
      .mockResolvedValueOnce(aResponse);
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    const { rerender, container } = renderWithProviders(
      <ConversationInsightsPanel channel={channelA} />,
      { client },
    );
    await waitFor(() =>
      expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('A-topic'),
    );

    // Switch to a channel B that has NO cached insights so the auto-run
    // path fires; that fetch fails. Without the bug fix, A's topics would
    // remain visible alongside B's error message + B's privacy strip.
    fetchSpy.mockRejectedValueOnce(new Error('B is down'));
    rerender(
      <QueryClientProvider client={client}>
        <ConversationInsightsPanel channel={channelB} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('B is down'));
    // Stale A topics must be gone — only the error renders, no body.
    expect(screen.queryByTestId('conversation-insights-topic')).toBeNull();
    expect(container.querySelector('[data-testid="privacy-strip"]')).toBeNull();
  });

  it('does not call the API when no channel is selected', async () => {
    const spy = vi.spyOn(aiApi, 'fetchConversationInsights');
    renderWithProviders(<ConversationInsightsPanel channel={null} />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/Select a chat/)).toBeInTheDocument();
  });

  it("renders each cached channel's own generatedAt on switch (no stale or missing timestamp)", async () => {
    // Pre-cache both channels with distinct generatedAt timestamps. We pin
    // explicit hours so the rendered string is deterministic regardless of
    // the test runner's wall clock.
    const aDate = new Date('2026-04-30T08:15:00');
    const bDate = new Date('2026-04-30T17:42:00');
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    client.setQueryData(['conversation-insights', channelA.id], {
      insights: makeInsights(channelA.id, 'A-topic'),
      generatedAt: aDate.toISOString(),
    });
    client.setQueryData(['conversation-insights', channelB.id], {
      insights: makeInsights(channelB.id, 'B-topic'),
      generatedAt: bDate.toISOString(),
    });
    const spy = vi.spyOn(aiApi, 'fetchConversationInsights');

    const { rerender } = renderWithProviders(
      <ConversationInsightsPanel channel={channelA} />,
      { client },
    );

    // A's cached path should hydrate A's generatedAt, not "now".
    await waitFor(() =>
      expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('A-topic'),
    );
    expect(screen.getByTestId('conversation-insights-timestamp')).toHaveTextContent(
      aDate.toLocaleTimeString(),
    );

    // Switch to B — the timestamp must update to B's cached value, not
    // remain pinned to A's.
    rerender(
      <QueryClientProvider client={client}>
        <ConversationInsightsPanel channel={channelB} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('B-topic'),
    );
    expect(screen.getByTestId('conversation-insights-timestamp')).toHaveTextContent(
      bDate.toLocaleTimeString(),
    );
    // The cached path is taken, so the LLM is never called.
    expect(spy).not.toHaveBeenCalled();
  });

  it('renders a confidence badge derived from how many sections the parser recovered', async () => {
    // Two of four sections populated → 0.50 (50% confidence) on the privacy strip.
    const sparseResponse: ConversationInsightsResponse = {
      ...makeInsights(channelA.id, 'phở'),
      actionItems: [],
      decisions: [],
      sentiment: 'positive',
    };
    vi.spyOn(aiApi, 'fetchConversationInsights').mockResolvedValue(sparseResponse);
    renderWithProviders(<ConversationInsightsPanel channel={channelA} />);
    await waitFor(() =>
      expect(screen.getByTestId('conversation-insights-topic')).toHaveTextContent('phở'),
    );
    expect(screen.getByTestId('privacy-confidence')).toHaveTextContent('50%');
  });
});

describe('computeInsightsConfidence', () => {
  function base(overrides: Partial<ConversationInsightsResponse> = {}): ConversationInsightsResponse {
    return {
      channelId: 'ch_x',
      topics: [],
      actionItems: [],
      decisions: [],
      sentiment: 'unknown',
      sourceMessageIds: [],
      model: 'bonsai-1.7b',
      tier: 'local',
      reason: '',
      computeLocation: 'on_device',
      dataEgressBytes: 0,
      ...overrides,
    };
  }

  it('returns 0 when no section is populated', () => {
    expect(computeInsightsConfidence(base())).toBe(0);
  });

  it('returns 0.25 for sentiment-only', () => {
    expect(computeInsightsConfidence(base({ sentiment: 'positive' }))).toBe(0.25);
  });

  it('returns 0.5 when two sections are populated', () => {
    expect(
      computeInsightsConfidence(base({ topics: [{ label: 't' }], sentiment: 'neutral' })),
    ).toBe(0.5);
  });

  it('returns 1 when every section is populated', () => {
    expect(
      computeInsightsConfidence(
        base({
          topics: [{ label: 't' }],
          actionItems: [{ text: 'a' }],
          decisions: [{ text: 'd' }],
          sentiment: 'mixed',
        }),
      ),
    ).toBe(1);
  });
});
