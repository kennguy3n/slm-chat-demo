import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadSummaryCard } from '../ThreadSummaryCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { ThreadSummaryResponse } from '../../../types/ai';

const sample: ThreadSummaryResponse = {
  prompt: 'Summarise the following thread…',
  sources: [
    { id: 'msg_eng_root', channelId: 'ch_engineering', sender: 'user_alice', excerpt: 'Kicking off' },
    { id: 'msg_eng_r1', channelId: 'ch_engineering', sender: 'user_dave', excerpt: 'requirements' },
  ],
  threadId: 'msg_eng_root',
  channelId: 'ch_engineering',
  model: 'gemma-4-e2b',
  tier: 'e2b',
  reason: 'short thread (4 messages); E2B is sufficient',
  messageCount: 4,
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('ThreadSummaryCard', () => {
  it('renders the model name and tier', () => {
    renderWithProviders(
      <ThreadSummaryCard summary={sample} streamingText="Alice is drafting a PRD." />,
    );
    expect(screen.getByTestId('thread-summary-model')).toHaveTextContent('gemma-4-e2b');
    expect(screen.getByTestId('thread-summary-tier')).toHaveTextContent('E2B');
  });

  it('renders the streamed text body', () => {
    renderWithProviders(
      <ThreadSummaryCard
        summary={sample}
        streamingText={'Alice is drafting a PRD.\nDave wants locale auto-detect.'}
      />,
    );
    const body = screen.getByTestId('thread-summary-body');
    expect(body).toHaveTextContent('Alice is drafting a PRD.');
    expect(body).toHaveTextContent('Dave wants locale auto-detect.');
  });

  it('renders source back-links from the summary', () => {
    renderWithProviders(
      <ThreadSummaryCard summary={sample} streamingText="ok" />,
    );
    const sources = screen.getByTestId('thread-summary-sources');
    expect(sources).toHaveTextContent('user_alice');
    expect(sources).toHaveTextContent('user_dave');
  });

  it('renders a placeholder when there is no streamed text yet', () => {
    renderWithProviders(<ThreadSummaryCard summary={sample} />);
    expect(screen.getByText(/loading summary/i)).toBeInTheDocument();
  });

  it('fires accept / edit / discard callbacks', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <ThreadSummaryCard
        summary={sample}
        streamingText="ok"
        onAccept={onAccept}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByTestId('thread-summary-accept'));
    await userEvent.click(screen.getByTestId('thread-summary-edit'));
    await userEvent.click(screen.getByTestId('thread-summary-discard'));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('renders the privacy strip with on-device / 0 egress', () => {
    renderWithProviders(
      <ThreadSummaryCard summary={sample} streamingText="ok" />,
    );
    expect(screen.getByTestId('privacy-compute')).toHaveTextContent('On-device');
    expect(screen.getByTestId('privacy-egress')).toHaveTextContent('0 B');
  });
});
