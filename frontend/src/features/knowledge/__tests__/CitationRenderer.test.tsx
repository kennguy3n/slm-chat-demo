import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CitationRenderer, parseCitations } from '../CitationRenderer';
import type { CitationSource } from '../CitationChip';

const SOURCES: CitationSource[] = [
  {
    kind: 'message',
    id: 'msg_1',
    label: 'Alice standup',
    sender: 'alice',
    excerpt: 'we should ship logging',
  },
  {
    kind: 'file',
    id: 'file_1',
    label: 'PRD.gdoc',
    excerpt: 'Q3 logging platform PRD',
    url: 'https://drive.example/x',
  },
];

describe('parseCitations', () => {
  it('splits text into text + cite segments', () => {
    const segs = parseCitations(
      'We should ship logging [source:msg_1]. See the PRD [source:file_1].',
    );
    expect(segs).toEqual([
      { type: 'text', value: 'We should ship logging ' },
      { type: 'cite', value: '[source:msg_1]', citedSourceId: 'msg_1' },
      { type: 'text', value: '. See the PRD ' },
      { type: 'cite', value: '[source:file_1]', citedSourceId: 'file_1' },
      { type: 'text', value: '.' },
    ]);
  });

  it('returns an empty list for empty input', () => {
    expect(parseCitations('')).toEqual([]);
  });
});

describe('CitationRenderer', () => {
  it('renders chips in reading order with stable indices', () => {
    render(
      <CitationRenderer
        text="Build [source:msg_1] then [source:file_1] then again [source:msg_1]."
        sources={SOURCES}
      />,
    );
    const firstChips = screen.getAllByTestId('citation-chip-1');
    expect(firstChips.length).toBe(2);
    expect(firstChips[0]).toHaveTextContent('[1]');
    expect(screen.getByTestId('citation-chip-2')).toHaveTextContent('[2]');
    // Repeat citation reuses the same index — no [3] should exist.
    expect(screen.queryByTestId('citation-chip-3')).toBeNull();
  });

  it('renders the Sources footer with one row per cited source in citation order', () => {
    render(
      <CitationRenderer
        text="Foo [source:file_1] bar [source:msg_1]."
        sources={SOURCES}
      />,
    );
    const footer = screen.getByTestId('citation-renderer-footer');
    expect(footer).toBeInTheDocument();
    // file_1 was cited first, so it should be listed at index 1.
    expect(screen.getByTestId('citation-renderer-source-1')).toHaveTextContent(
      /PRD.gdoc/,
    );
    expect(screen.getByTestId('citation-renderer-source-2')).toHaveTextContent(
      /Alice standup/,
    );
  });

  it('falls back to plain text when there are no markers but still renders the footer if sources are present', () => {
    render(
      <CitationRenderer text="No citations here." sources={SOURCES} />,
    );
    expect(screen.queryByTestId('citation-chip-1')).toBeNull();
    expect(screen.getByTestId('citation-renderer-footer')).toBeInTheDocument();
  });

  it('leaves unknown source markers as plain text', () => {
    render(
      <CitationRenderer
        text="Hello [source:does_not_exist] world."
        sources={SOURCES}
      />,
    );
    expect(
      screen.getByTestId('citation-renderer').textContent,
    ).toMatch(/\[source:does_not_exist\]/);
  });

  it('omits the footer entirely when sources is empty', () => {
    render(<CitationRenderer text="No sources at all." sources={[]} />);
    expect(screen.queryByTestId('citation-renderer-footer')).toBeNull();
  });
});
