import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CitationChip } from '../CitationChip';

describe('CitationChip', () => {
  it('renders the index and an aria-label that includes the source label', () => {
    render(
      <CitationChip
        index={2}
        source={{ kind: 'message', id: 'msg_1', label: 'Alice in #engineering' }}
      />,
    );
    const chip = screen.getByTestId('citation-chip-2');
    expect(chip).toHaveTextContent('[2]');
    expect(chip).toHaveAttribute(
      'aria-label',
      'Citation 2: Alice in #engineering',
    );
  });

  it('builds a tooltip from label, sender, timestamp and excerpt', () => {
    render(
      <CitationChip
        index={1}
        source={{
          kind: 'message',
          id: 'msg_1',
          label: 'Standup msg',
          sender: 'alice',
          timestamp: '2026-04-01',
          excerpt: 'we should ship logging',
        }}
      />,
    );
    const chip = screen.getByTestId('citation-chip-1');
    expect(chip.getAttribute('title')).toMatch(/Standup msg/);
    expect(chip.getAttribute('title')).toMatch(/alice/);
    expect(chip.getAttribute('title')).toMatch(/2026-04-01/);
    expect(chip.getAttribute('title')).toMatch(/we should ship logging/);
  });

  it('fires onSelect when clicked', () => {
    const onSelect = vi.fn();
    const source = {
      kind: 'file' as const,
      id: 'file_1',
      label: 'PRD.gdoc',
      url: 'https://drive.example/x',
    };
    render(<CitationChip index={3} source={source} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('citation-chip-3'));
    expect(onSelect).toHaveBeenCalledWith(source);
  });

  it('opens the file URL when no onSelect handler is provided', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <CitationChip
        index={1}
        source={{
          kind: 'file',
          id: 'file_1',
          label: 'PRD.gdoc',
          url: 'https://drive.example/x',
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('citation-chip-1'));
    expect(open).toHaveBeenCalledWith(
      'https://drive.example/x',
      '_blank',
      'noopener',
    );
    open.mockRestore();
  });
});
