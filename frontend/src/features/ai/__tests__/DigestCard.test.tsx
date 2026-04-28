import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DigestCard } from '../DigestCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { UnreadSummaryResponse } from '../../../types/ai';

const sampleDigest: UnreadSummaryResponse = {
  prompt: 'Summarise these recent unread messages…',
  model: 'gemma-4-e2b',
  sources: [
    { id: 'm1', channelId: 'c1', sender: 'Bob', excerpt: 'Hey, ping' },
    { id: 'm2', channelId: 'c2', sender: 'Carol', excerpt: 'Reminder' },
  ],
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('DigestCard', () => {
  it('renders the model name and the streamed text after streaming finishes', () => {
    renderWithProviders(
      <DigestCard
        digest={sampleDigest}
        streamingText={'You have 2 messages.\nDeadline tomorrow.'}
      />,
    );
    expect(screen.getByTestId('digest-card-model')).toHaveTextContent('gemma-4-e2b');
    const body = screen.getByTestId('digest-card-body');
    expect(body).toHaveTextContent('You have 2 messages.');
    expect(body).toHaveTextContent('Deadline tomorrow.');
  });

  it('shows streamingText while isStreaming=true', () => {
    renderWithProviders(
      <DigestCard digest={sampleDigest} isStreaming streamingText="Stream so far…" />,
    );
    const body = screen.getByTestId('digest-card-body');
    expect(body).toHaveTextContent('Stream so far…');
  });

  it('renders source back-links inside the disclosure', () => {
    renderWithProviders(<DigestCard digest={sampleDigest} streamingText="ok" />);
    const sources = screen.getByTestId('digest-card-sources');
    expect(sources).toHaveTextContent('Bob');
    expect(sources).toHaveTextContent('Carol');
  });

  it('fires accept / edit / discard callbacks', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <DigestCard
        digest={sampleDigest}
        streamingText="ok"
        onAccept={onAccept}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByTestId('digest-card-accept'));
    await userEvent.click(screen.getByTestId('digest-card-edit'));
    await userEvent.click(screen.getByTestId('digest-card-discard'));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('renders a placeholder when there is no streaming text yet', () => {
    const empty: UnreadSummaryResponse = {
      ...sampleDigest,
      sources: [],
    };
    renderWithProviders(<DigestCard digest={empty} />);
    expect(screen.getByText(/no unread messages/i)).toBeInTheDocument();
  });
});
