import type { ArtifactSourcePin } from '../../types/kapps';

interface Props {
  pin: ArtifactSourcePin;
  // Index in the section's pin list — surfaced as the badge label
  // ("[1]", "[2]" …) like a footnote marker.
  index: number;
  onNavigate?: (pin: ArtifactSourcePin) => void;
}

// SourcePin — Phase 3 inline footnote chip. Renders the source message
// sender + excerpt on hover; clicking forwards to the parent so the
// renderer can scroll to / highlight the originating message in the
// chat thread (PROPOSAL.md §6.2 source pins).
export function SourcePin({ pin, index, onNavigate }: Props) {
  const label = `[${index + 1}]`;
  const tooltip = [pin.sender, pin.excerpt].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className="source-pin"
      onClick={() => onNavigate?.(pin)}
      title={tooltip || pin.sourceMessageId || pin.sectionId}
      aria-label={`Open source ${label}`}
      data-testid={`source-pin-${pin.sectionId}-${index}`}
    >
      <sup className="source-pin__sup">{label}</sup>
      <span className="source-pin__excerpt">
        {pin.sender && <strong>{pin.sender}: </strong>}
        {pin.excerpt}
      </span>
    </button>
  );
}
