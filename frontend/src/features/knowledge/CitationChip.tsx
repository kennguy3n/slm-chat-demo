import type { MouseEvent } from 'react';

export interface CitationSource {
  kind: 'message' | 'file';
  id: string;
  label: string;
  excerpt?: string;
  sender?: string;
  timestamp?: string;
  // Optional URL — for file citations the click handler navigates to
  // the connector URL; for messages it falls back to the in-app
  // anchor `#message-{id}`.
  url?: string;
}

interface Props {
  index: number;
  source: CitationSource;
  onSelect?: (source: CitationSource) => void;
}

// CitationChip renders a small inline `[1]`-style chip used inside
// AI outputs to attribute a sentence or paragraph to a specific
// source message or connector file. Hovering reveals a tooltip with
// the excerpt + sender + timestamp; clicking either fires onSelect
// (if provided) or navigates to the anchor / file URL.
//
// The chip is a button so screen readers announce it as actionable;
// the visible label uses parentheses-bracketed digits so the
// renderer can copy-paste citations into plain text without losing
// the marker.
export function CitationChip({ index, source, onSelect }: Props) {
  const tooltip = buildTooltip(source);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (onSelect) {
      e.preventDefault();
      onSelect(source);
      return;
    }
    if (source.kind === 'file' && source.url) {
      // Let the default anchor behaviour kick in via window.open so
      // we don't lose the click on file citations without onSelect.
      e.preventDefault();
      window.open(source.url, '_blank', 'noopener');
      return;
    }
    if (source.kind === 'message') {
      e.preventDefault();
      const target = document.getElementById(`message-${source.id}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.location.hash = `message-${source.id}`;
      }
    }
  }

  return (
    <button
      type="button"
      className="citation-chip"
      onClick={handleClick}
      title={tooltip}
      aria-label={`Citation ${index}: ${source.label}`}
      data-testid={`citation-chip-${index}`}
      data-source-kind={source.kind}
      data-source-id={source.id}
    >
      <span aria-hidden>[{index}]</span>
    </button>
  );
}

function buildTooltip(s: CitationSource): string {
  const parts: string[] = [s.label];
  if (s.sender) parts.push(s.sender);
  if (s.timestamp) parts.push(s.timestamp);
  if (s.excerpt) parts.push(`\u201c${s.excerpt}\u201d`);
  return parts.join(' \u2014 ');
}
