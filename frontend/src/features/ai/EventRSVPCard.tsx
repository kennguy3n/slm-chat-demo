import { useState } from 'react';
import { fetchEventRSVP } from '../../api/aiApi';
import type { EventRSVPResponse, RSVPEvent } from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  channelId: string | null;
  channelName?: string;
}

type RSVPStatus = 'yes' | 'no' | 'maybe' | 'undecided';

// EventRSVPCard is the B2C "community event / RSVP" surface
// (PROPOSAL.md §3.2, PHASES.md Phase 2). Reads the recent community
// chat, lifts upcoming events into structured cards, and lets the user
// RSVP yes / no / maybe locally (state is in-memory; persistence lives
// in the AI Memory store / KApp event objects in later phases).
export function EventRSVPCard({ channelId, channelName }: Props) {
  const [data, setData] = useState<EventRSVPResponse | null>(null);
  const [status, setStatus] = useState<Record<string, RSVPStatus>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    if (!channelId) return;
    setErr(null);
    setLoading(true);
    setStatus({});
    fetchEventRSVP({ channelId })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setLoading(false);
      });
  }

  function setRSVP(event: RSVPEvent, idx: number, value: RSVPStatus) {
    const key = event.sourceMessageId ?? `${idx}-${event.title}`;
    setStatus((s) => ({ ...s, [key]: value }));
  }

  function statusFor(event: RSVPEvent, idx: number): RSVPStatus {
    const key = event.sourceMessageId ?? `${idx}-${event.title}`;
    return status[key] ?? 'undecided';
  }

  return (
    <section
      className="event-rsvp-card"
      aria-label="Community events"
      data-testid="event-rsvp-card"
    >
      <header className="event-rsvp-card__header">
        <h3 className="event-rsvp-card__title">Upcoming events</h3>
        <p className="event-rsvp-card__subtitle">
          Lifts events out of {channelName ?? 'this chat'} so you can RSVP without scrolling.
        </p>
        <button
          type="button"
          className="event-rsvp-card__run"
          onClick={run}
          disabled={loading || !channelId}
          data-testid="event-rsvp-run"
        >
          {loading ? 'Scanning…' : data ? 'Refresh events' : 'Find events'}
        </button>
      </header>

      {!channelId && (
        <p className="event-rsvp-card__empty">Pick a community chat to scan for events.</p>
      )}

      {err && (
        <div role="alert" className="event-rsvp-card__error">
          Event extraction failed: {err}
        </div>
      )}

      {data && (
        <>
          {data.events.length === 0 ? (
            <p className="event-rsvp-card__empty" data-testid="event-rsvp-empty">
              No upcoming events found in the recent messages.
            </p>
          ) : (
            <ul className="event-rsvp-card__list" data-testid="event-rsvp-list">
              {data.events.map((ev, i) => {
                const cur = statusFor(ev, i);
                return (
                  <li
                    key={`${i}-${ev.title}`}
                    className="event-rsvp-card__row"
                    data-testid={`event-rsvp-row-${i}`}
                  >
                    <div className="event-rsvp-card__meta">
                      <strong className="event-rsvp-card__event-title">{ev.title}</strong>
                      {ev.whenHint && (
                        <span className="event-rsvp-card__when">{ev.whenHint}</span>
                      )}
                      {ev.location && (
                        <span className="event-rsvp-card__where">{ev.location}</span>
                      )}
                      {ev.rsvpBy && (
                        <span className="event-rsvp-card__rsvp-by">RSVP by {ev.rsvpBy}</span>
                      )}
                    </div>
                    <div
                      className="event-rsvp-card__actions"
                      role="group"
                      aria-label={`RSVP for ${ev.title}`}
                    >
                      {(['yes', 'maybe', 'no'] as RSVPStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={
                            'event-rsvp-card__rsvp' +
                            (cur === s ? ' event-rsvp-card__rsvp--active' : '')
                          }
                          aria-pressed={cur === s}
                          onClick={() => setRSVP(ev, i, s)}
                          data-testid={`event-rsvp-${s}-${i}`}
                        >
                          {s === 'yes' ? 'Yes' : s === 'no' ? 'No' : 'Maybe'}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <PrivacyStrip
            data={{
              computeLocation: data.computeLocation,
              modelName: data.model,
              sources: data.sourceMessageIds.map((id) => ({
                kind: 'message' as const,
                id,
                label: id,
              })),
              dataEgressBytes: data.dataEgressBytes,
              whySuggested: data.reason,
              whyDetails: [
                { signal: `Routed to ${data.tier.toUpperCase()}` },
                { signal: `${data.events.length} events lifted` },
                { signal: 'RSVPs stay on this device' },
              ],
              origin: {
                kind: 'message',
                id: data.sourceMessageIds[0] ?? data.channelId,
                label: channelName ?? data.channelId,
              },
            }}
          />
        </>
      )}
    </section>
  );
}
