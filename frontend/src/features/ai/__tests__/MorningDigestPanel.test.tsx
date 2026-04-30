import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MorningDigestPanel } from '../MorningDigestPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as aiApi from '../../../api/aiApi';
import * as streamModule from '../../../api/streamAI';
import type { UnreadSummaryResponse } from '../../../types/ai';

const fakeDigest: UnreadSummaryResponse = {
  prompt: 'Summarize…',
  model: 'ternary-bonsai-8b',
  sources: [
    { id: 's1', channelId: 'ch1', sender: 'alice', excerpt: 'field-trip Friday' },
    { id: 's2', channelId: 'ch2', sender: 'bob', excerpt: 'sunscreen needed' },
  ],
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('MorningDigestPanel', () => {
  beforeEach(() => {
    vi.spyOn(aiApi, 'fetchUnreadSummary').mockResolvedValue(fakeDigest);
    vi.spyOn(streamModule, 'streamAITask').mockImplementation((_req, h) => {
      h.onChunk('Morning summary content.');
      h.onDone?.();
      return new AbortController();
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-runs the digest on mount and shows metrics + body when complete', async () => {
    renderWithProviders(<MorningDigestPanel />);
    await waitFor(() =>
      expect(screen.getByTestId('digest-card-body')).toHaveTextContent('Morning summary content.'),
    );
    const metrics = screen.getByTestId('morning-digest-metrics');
    expect(metrics).toHaveTextContent('Chats');
    expect(metrics).toHaveTextContent('Messages');
    expect(metrics).toHaveTextContent('Egress');
    expect(metrics).toHaveTextContent('On-device');
    // 2 unique channels in fakeDigest.sources
    expect(metrics).toHaveTextContent('2');
  });

  it('re-runs the digest when the refresh button is clicked', async () => {
    renderWithProviders(<MorningDigestPanel />);
    await waitFor(() =>
      expect(screen.getByTestId('digest-card-body')).toHaveTextContent('Morning summary content.'),
    );
    await userEvent.click(screen.getByTestId('morning-digest-run'));
    await waitFor(() =>
      expect(aiApi.fetchUnreadSummary).toHaveBeenCalledTimes(2),
    );
  });

  it('shows an error alert when the auto-run fetch fails', async () => {
    vi.spyOn(aiApi, 'fetchUnreadSummary').mockReset();
    vi.spyOn(aiApi, 'fetchUnreadSummary').mockRejectedValue(new Error('boom'));
    renderWithProviders(<MorningDigestPanel />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/boom/));
  });
});
