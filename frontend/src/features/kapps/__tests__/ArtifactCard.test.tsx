import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactCard } from '../ArtifactCard';
import type { Artifact } from '../../../types/kapps';

const baseArtifact: Artifact = {
  id: 'art_1',
  channelId: 'ch_engineering',
  type: 'PRD',
  title: 'Inline translation PRD',
  templateId: 'prd_v1',
  versions: [
    { version: 1, createdAt: '2026-04-28T07:00:00Z', author: 'user_alice', summary: 'First draft' },
    { version: 2, createdAt: '2026-04-28T08:00:00Z', author: 'user_alice', summary: 'Second draft' },
  ],
  status: 'draft',
  aiGenerated: true,
};

describe('ArtifactCard', () => {
  it('renders type, title, latest version, status, and author', () => {
    render(<ArtifactCard artifact={baseArtifact} />);
    expect(screen.getByText('PRD')).toBeInTheDocument();
    expect(screen.getByText('Inline translation PRD')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-card-version')).toHaveTextContent('v2');
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('user_alice')).toBeInTheDocument();
    expect(screen.getByText('Second draft')).toBeInTheDocument();
  });

  it('renders v0 when there are no versions', () => {
    render(<ArtifactCard artifact={{ ...baseArtifact, versions: [] }} />);
    expect(screen.getByTestId('artifact-card-version')).toHaveTextContent('v0');
  });

  it('calls onOpen with the artifact when the View button is clicked', async () => {
    const onOpen = vi.fn();
    render(<ArtifactCard artifact={baseArtifact} onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId('artifact-card-view'));
    expect(onOpen).toHaveBeenCalledWith(baseArtifact);
  });

  it('toggles the version history list when more than one version exists', async () => {
    render(<ArtifactCard artifact={baseArtifact} />);
    expect(screen.queryByTestId('artifact-card-history')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('artifact-card-history-toggle'));
    expect(screen.getByTestId('artifact-card-history')).toBeInTheDocument();
  });

  it('hides actions in compact mode', () => {
    render(<ArtifactCard artifact={baseArtifact} mode="compact" />);
    expect(screen.queryByTestId('artifact-card-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-card-history-toggle')).not.toBeInTheDocument();
  });
});
