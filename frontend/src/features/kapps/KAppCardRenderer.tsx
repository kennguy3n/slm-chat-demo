import type { KAppCard } from '../../types/kapps';
import { TaskCard } from './TaskCard';
import { ApprovalCard } from './ApprovalCard';
import { ArtifactCard } from './ArtifactCard';
import { EventCard } from './EventCard';

interface Props {
  card: KAppCard;
}

// KAppCardRenderer is the dispatcher referenced in ARCHITECTURE.md section
// 2.1 — it inspects the card kind and forwards to the matching component.
// It returns null for an unknown / mis-shaped card so consumers can map over
// a heterogeneous list without filtering first.
export function KAppCardRenderer({ card }: Props) {
  switch (card.kind) {
    case 'task':
      return card.task ? <TaskCard task={card.task} /> : null;
    case 'approval':
      return card.approval ? <ApprovalCard approval={card.approval} /> : null;
    case 'artifact':
      return card.artifact ? <ArtifactCard artifact={card.artifact} /> : null;
    case 'event':
      return card.event ? <EventCard event={card.event} /> : null;
    default:
      return null;
  }
}
