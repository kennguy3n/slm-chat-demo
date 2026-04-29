import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactWorkspace } from '../ArtifactWorkspace';
import type { Artifact, ArtifactVersion } from '../../../types/kapps';

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art_1',
    channelId: 'ch_x',
    type: 'PRD',
    title: 'Inline translation PRD',
    status: 'draft',
    author: 'user_alice',
    aiGenerated: false,
    sourceThreadId: 'thr_1',
    versions: [
      {
        version: 1,
        author: 'user_alice',
        createdAt: '2026-04-29T00:00:00Z',
        summary: 'initial',
        body: '# Goal\nShip per-message translation.\n\n# Risks\nLatency.\n',
        sourcePins: [
          {
            sectionId: 'goal',
            sourceMessageId: 'm1',
            sourceThreadId: 'thr_1',
            excerpt: 'We need inline translation',
            sender: 'alice',
          },
        ],
      },
    ],
    createdAt: '2026-04-29T00:00:00Z',
    updatedAt: '2026-04-29T00:00:00Z',
    ...overrides,
  };
}

describe('ArtifactWorkspace', () => {
  it('renders sections, source pins and version history', () => {
    render(
      <ArtifactWorkspace
        artifact={makeArtifact()}
        injectedGetArtifact={async () => makeArtifact()}
        injectedGetVersion={async () => makeArtifact().versions[0]}
        injectedCreateVersion={vi.fn()}
        injectedUpdateArtifact={vi.fn()}
      />,
    );
    expect(screen.getByTestId('artifact-workspace')).toBeInTheDocument();
    expect(screen.getByText(/Inline translation PRD/)).toBeInTheDocument();
    expect(screen.getByText(/Goal/)).toBeInTheDocument();
    expect(screen.getByTestId('artifact-workspace-version-1')).toBeInTheDocument();
    // The pin should be rendered inline next to its section.
    expect(screen.getByTestId('source-pin-goal-0')).toBeInTheDocument();
  });

  it('saves a new version using injectedCreateVersion', async () => {
    const newVersion: ArtifactVersion = {
      version: 2,
      author: 'user_alice',
      createdAt: '2026-04-29T01:00:00Z',
      summary: 'expand goal',
      body: '# Goal\nShip per-message translation, on-device.\n',
      sourcePins: [],
    };
    const create = vi.fn().mockResolvedValue(newVersion);
    render(
      <ArtifactWorkspace
        artifact={makeArtifact()}
        injectedGetArtifact={async () => makeArtifact()}
        injectedGetVersion={async () => makeArtifact().versions[0]}
        injectedCreateVersion={create}
        injectedUpdateArtifact={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('artifact-workspace-new-version'));
    const editor = await screen.findByTestId('artifact-workspace-editor-body');
    await userEvent.clear(editor);
    await userEvent.type(editor, '# Goal\nShip per-message translation, on-device.');
    await userEvent.click(screen.getByTestId('artifact-workspace-save-version'));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('artifact-workspace-version-2')).toBeInTheDocument(),
    );
  });

  it('transitions status to published via injectedUpdateArtifact', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({ ...makeArtifact(), status: 'published' });
    render(
      <ArtifactWorkspace
        artifact={makeArtifact()}
        injectedGetArtifact={async () => makeArtifact()}
        injectedGetVersion={async () => makeArtifact().versions[0]}
        injectedCreateVersion={vi.fn()}
        injectedUpdateArtifact={update}
      />,
    );
    await userEvent.click(screen.getByTestId('artifact-workspace-publish'));
    await waitFor(() => expect(update).toHaveBeenCalledWith('art_1', { status: 'published' }));
    await waitFor(() =>
      expect(screen.getByTestId('artifact-workspace-status')).toHaveTextContent(/published/),
    );
  });
});
