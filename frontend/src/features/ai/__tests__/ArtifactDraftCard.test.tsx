import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactDraftCard } from '../ArtifactDraftCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { DraftArtifactResponse } from '../../../types/ai';

const sample: DraftArtifactResponse = {
  prompt: 'Draft a PRD …',
  sources: [
    { id: 'm1', channelId: 'c1', sender: 'u1', excerpt: 'Need inline translation.' },
    { id: 'm2', channelId: 'c1', sender: 'u2', excerpt: 'On-device only.' },
  ],
  threadId: 't1',
  channelId: 'c1',
  artifactType: 'PRD',
  section: 'all',
  title: 'PRD: Inline translation',
  model: 'bonsai-1.7b',
  tier: 'local',
  reason: 'Drafting a PRD benefits from Bonsai-1.7B reasoning.',
  messageCount: 2,
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('ArtifactDraftCard', () => {
  it('renders the title, tier and section', () => {
    renderWithProviders(<ArtifactDraftCard draft={sample} streamingText="ok" />);
    expect(screen.getByTestId('artifact-draft-title')).toHaveTextContent('PRD');
    expect(screen.getByTestId('artifact-draft-tier')).toHaveTextContent('LOCAL');
    expect(screen.getByTestId('artifact-draft-section')).toHaveTextContent(/draft/i);
  });

  it('renders the streamed body text', () => {
    renderWithProviders(
      <ArtifactDraftCard draft={sample} streamingText={'# Goal\nFoo bar\n## Requirements'} />,
    );
    const body = screen.getByTestId('artifact-draft-body');
    expect(body).toHaveTextContent('# Goal');
    expect(body).toHaveTextContent('Foo bar');
    expect(body).toHaveTextContent('## Requirements');
  });

  it('shows a placeholder while no text has streamed yet', () => {
    renderWithProviders(<ArtifactDraftCard draft={sample} />);
    const body = screen.getByTestId('artifact-draft-body');
    expect(body).toHaveTextContent(/drafting/i);
  });

  it('renders source back-links from the draft response', () => {
    renderWithProviders(<ArtifactDraftCard draft={sample} streamingText="ok" />);
    const sources = screen.getByTestId('artifact-draft-sources');
    expect(sources).toHaveTextContent('u1');
    expect(sources).toHaveTextContent('Need inline translation');
  });

  it('fires edit, discard, and accept callbacks', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <ArtifactDraftCard
        draft={sample}
        streamingText="ok"
        onAccept={onAccept}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />,
    );
    // Click edit/discard before accept — accepting transitions the
    // card into a locked "Saved" state where the other actions are
    // intentionally disabled.
    await userEvent.click(screen.getByTestId('artifact-draft-edit'));
    await userEvent.click(screen.getByTestId('artifact-draft-discard'));
    await userEvent.click(screen.getByTestId('artifact-draft-accept'));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('disables the accept button while saving and after a successful save', async () => {
    let resolve!: () => void;
    const onAccept = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    renderWithProviders(
      <ArtifactDraftCard draft={sample} streamingText="ok" onAccept={onAccept} />,
    );
    const btn = screen.getByTestId('artifact-draft-accept');
    await userEvent.click(btn);
    // Concurrent click while the first save is in flight must NOT
    // dispatch a second onAccept call.
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/saving/i);
    expect(onAccept).toHaveBeenCalledTimes(1);
    resolve();
    await screen.findByText(/saved/i);
    expect(btn).toBeDisabled();
  });

  it('disables the accept button while the body is still streaming', () => {
    renderWithProviders(
      <ArtifactDraftCard draft={sample} streamingText="partial" isStreaming />,
    );
    expect(screen.getByTestId('artifact-draft-accept')).toBeDisabled();
  });

  it('surfaces an error and re-enables the button when onAccept rejects', async () => {
    const onAccept = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined);
    renderWithProviders(
      <ArtifactDraftCard draft={sample} streamingText="ok" onAccept={onAccept} />,
    );
    const btn = screen.getByTestId('artifact-draft-accept');
    await userEvent.click(btn);
    expect(await screen.findByTestId('artifact-draft-error')).toHaveTextContent(
      /network down/i,
    );
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent(/save as draft/i);
    // Retry on the same button now succeeds.
    await userEvent.click(btn);
    expect(onAccept).toHaveBeenCalledTimes(2);
    expect(btn).toHaveTextContent(/saved/i);
    expect(btn).toBeDisabled();
  });
});
