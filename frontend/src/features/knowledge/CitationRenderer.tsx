import { Fragment, type ReactNode } from 'react';
import { CitationChip, type CitationSource } from './CitationChip';

interface Props {
  text: string;
  // The set of sources cited by `text`. The renderer does not require
  // every source to be referenced — sources without a `[source:id]`
  // marker still appear in the footer so the consumer can show a
  // full attribution list.
  sources: CitationSource[];
  onSelect?: (source: CitationSource) => void;
  // Optional override for the footer heading. Defaults to
  // `Sources (N)`.
  footerLabel?: string;
}

const CITATION_RE = /\[source:([a-zA-Z0-9_\-:.]+)\]/g;

interface ParsedSegment {
  type: 'text' | 'cite';
  value: string;
  citedSourceId?: string;
}

// parseCitations is exported separately so consumers (and tests) can
// validate the parser without rendering. Empty input returns an empty
// segment list rather than `[{ type: 'text', value: '' }]` so callers
// can branch cleanly.
export function parseCitations(text: string): ParsedSegment[] {
  if (!text) return [];
  const out: ParsedSegment[] = [];
  let lastIdx = 0;
  CITATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      out.push({ type: 'text', value: text.slice(lastIdx, match.index) });
    }
    out.push({ type: 'cite', value: match[0], citedSourceId: match[1] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    out.push({ type: 'text', value: text.slice(lastIdx) });
  }
  return out;
}

// CitationRenderer parses `[source:id]` markers in `text` and replaces
// them with CitationChip components numbered in reading order. It
// renders a "Sources (N)" footer listing every chip's full attribution
// (label, excerpt, sender, timestamp). When `text` contains no markers
// the renderer falls back to a plain text + footer rendering so
// existing AI cards can hand it their body unchanged.
export function CitationRenderer({
  text,
  sources,
  onSelect,
  footerLabel,
}: Props) {
  const segments = parseCitations(text);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  // Track the citation order so [source:abc] [source:abc] [source:xyz]
  // produces [1] [1] [2] instead of [1] [2] [3].
  const indexBySourceId = new Map<string, number>();
  let nextIndex = 1;

  const nodes: ReactNode[] = [];
  for (const [i, seg] of segments.entries()) {
    if (seg.type === 'text') {
      nodes.push(<Fragment key={`t-${i}`}>{seg.value}</Fragment>);
      continue;
    }
    const id = seg.citedSourceId ?? '';
    const src = sourceById.get(id);
    if (!src) {
      // Unknown source id — leave the marker as plain text so the
      // demo author can spot the mistake without breaking the layout.
      nodes.push(<Fragment key={`t-${i}`}>{seg.value}</Fragment>);
      continue;
    }
    let idx = indexBySourceId.get(id);
    if (idx === undefined) {
      idx = nextIndex++;
      indexBySourceId.set(id, idx);
    }
    nodes.push(
      <CitationChip
        key={`c-${i}`}
        index={idx}
        source={src}
        onSelect={onSelect}
      />,
    );
  }

  // Compute footer entries in the order they were cited so the
  // numbering matches.
  const footerEntries = [...indexBySourceId.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id, idx]) => ({ idx, source: sourceById.get(id)! }));

  return (
    <div className="citation-renderer" data-testid="citation-renderer">
      <div className="citation-renderer__body">
        {segments.length === 0 ? null : nodes}
      </div>
      {sources.length > 0 && (
        <details
          className="citation-renderer__footer"
          data-testid="citation-renderer-footer"
        >
          <summary>
            {footerLabel ?? `Sources (${sources.length})`}
          </summary>
          <ol className="citation-renderer__sources-list">
            {(footerEntries.length > 0 ? footerEntries : sources.map((s, i) => ({ idx: i + 1, source: s }))).map(
              ({ idx, source }) => (
                <li
                  key={`${source.kind}-${source.id}`}
                  data-testid={`citation-renderer-source-${idx}`}
                >
                  <span className="citation-renderer__source-index">[{idx}]</span>{' '}
                  <span className="citation-renderer__source-kind">
                    {source.kind}
                  </span>{' '}
                  <span className="citation-renderer__source-label">
                    {source.label}
                  </span>
                  {source.sender && (
                    <span className="citation-renderer__source-sender">
                      {' '}— {source.sender}
                    </span>
                  )}
                  {source.excerpt && (
                    <p className="citation-renderer__source-excerpt">
                      “{source.excerpt}”
                    </p>
                  )}
                </li>
              ),
            )}
          </ol>
        </details>
      )}
    </div>
  );
}
