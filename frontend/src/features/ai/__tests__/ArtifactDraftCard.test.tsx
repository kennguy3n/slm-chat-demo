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
  model: 'gemma-4-e4b',
  tier: 'e4b',
  reason: 'Drafting a PRD benefits from E4B reasoning.',
  messageCount: 2,
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('ArtifactDraftCard', () => {
  it('renders the title, tier and section', () => {
    renderWithProviders(<ArtifactDraftCard draft={sample} streamingText="ok" />);
    expect(screen.getByTestId('artifact-draft-title')).toHaveTextContent('PRD');
    expect(screen.getByTestId('artifact-draft-tier')).toHaveTextContent('E4B');
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

  it('fires accept / edit / discard callbacks', async () => {
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
    await userEvent.click(screen.getByTestId('artifact-draft-accept'));
    await userEvent.click(screen.getByTestId('artifact-draft-edit'));
    await userEvent.click(screen.getByTestId('artifact-draft-discard'));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
