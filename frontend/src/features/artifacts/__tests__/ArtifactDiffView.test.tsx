import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactDiffView } from '../ArtifactDiffView';
import { computeLineDiff } from '../lineDiff';

describe('computeLineDiff', () => {
  it('marks identical lines as context', () => {
    const lines = computeLineDiff('a\nb\nc', 'a\nb\nc');
    expect(lines.every((l) => l.kind === 'context')).toBe(true);
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c']);
  });

  it('detects added and removed lines using LCS', () => {
    const lines = computeLineDiff('a\nb\nc', 'a\nB\nc');
    const added = lines.filter((l) => l.kind === 'added').map((l) => l.text);
    const removed = lines.filter((l) => l.kind === 'removed').map((l) => l.text);
    expect(removed).toEqual(['b']);
    expect(added).toEqual(['B']);
  });

  it('handles fully replaced bodies', () => {
    const lines = computeLineDiff('old', 'new');
    expect(lines).toEqual([
      { kind: 'removed', text: 'old' },
      { kind: 'added', text: 'new' },
    ]);
  });
});

describe('ArtifactDiffView', () => {
  it('renders headers and per-line markers', () => {
    render(
      <ArtifactDiffView fromBody="a\nb" toBody="a\nB" fromVersion={1} toVersion={2} />,
    );
    expect(screen.getByTestId('artifact-diff')).toBeInTheDocument();
    expect(screen.getByText(/v1.*v2/i)).toBeInTheDocument();
  });
});
