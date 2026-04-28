import type { EventCard as EventCardData, EventRSVP } from '../../types/kapps';

interface Props {
  event: EventCardData;
  onRSVP?: (rsvp: EventRSVP) => void;
}

const RSVP_LABEL: Record<EventRSVP, string> = {
  accepted: 'Going',
  declined: 'Declined',
  none: 'No reply',
};

function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// EventCard renders a community / family event extracted from chat. It
// surfaces date, location, RSVP state, and attendee count
// (PROPOSAL.md 5 — neighborhood block-party flow).
export function EventCard({ event, onRSVP }: Props) {
  return (
    <article
      className="kapp-card kapp-card--event"
      data-testid="event-card"
      aria-label={`Event: ${event.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">Event</span>
        {event.aiGenerated && <span className="kapp-card__ai-badge">AI</span>}
        <span className={`kapp-card__status kapp-card__rsvp kapp-card__rsvp--${event.rsvp}`}>
          {RSVP_LABEL[event.rsvp]}
        </span>
      </header>
      <h4 className="kapp-card__title">{event.title}</h4>
      <dl className="kapp-card__meta">
        <div>
          <dt>When</dt>
          <dd>{formatStartsAt(event.startsAt)}</dd>
        </div>
        {event.location && (
          <div>
            <dt>Where</dt>
            <dd>{event.location}</dd>
          </div>
        )}
        <div>
          <dt>Attendees</dt>
          <dd>{event.attendeeCount}</dd>
        </div>
      </dl>
      <div className="kapp-card__actions">
        <button type="button" onClick={() => onRSVP?.('accepted')} aria-label="RSVP accept">
          Accept
        </button>
        <button type="button" onClick={() => onRSVP?.('declined')} aria-label="RSVP decline">
          Decline
        </button>
      </div>
    </article>
  );
}
