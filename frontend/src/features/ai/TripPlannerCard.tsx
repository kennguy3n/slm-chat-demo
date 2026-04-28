import { useEffect, useState } from 'react';
import { fetchTripPlan } from '../../api/aiApi';
import type {
  TripPlannerExecution,
  TripPlannerInputArgs,
  TripPlannerSkillSource,
} from '../../types/electron';
import type { MemoryFact, PrivacyStripSource } from '../../types/ai';
import { createMemoryStore, type MemoryStore } from '../memory/memoryStore';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  // Tests inject a deterministic store; production callers omit this so
  // the card picks up the shared IndexedDB-backed store.
  store?: MemoryStore;
  // Tests can stub the IPC call so they don't need a live preload bridge.
  runTripPlan?: (args: { input: TripPlannerInputArgs; channelId?: string }) => Promise<
    TripPlannerExecution
  >;
}

// TripPlannerCard is the Phase 2 B2C "Trip" surface (PROPOSAL.md §3.2,
// PHASES.md Phase 2). The user provides destination + duration, the
// card pulls AI Memory (location, members, preferences) plus mock
// search-service results, asks the SLM to weave them into a day-by-day
// itinerary, and renders day cards with on-device routing in the
// privacy strip. Each item is sourced (memory / weather / event /
// attraction) so the user can audit where each suggestion came from.
export function TripPlannerCard({ store, runTripPlan = fetchTripPlan }: Props = {}) {
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [destination, setDestination] = useState('');
  const [days, setDays] = useState(3);
  const [focus, setFocus] = useState('');
  const [data, setData] = useState<TripPlannerExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const s = store ?? createMemoryStore();
    s.list()
      .then((rows) => {
        if (!cancelled) setMemoryFacts(rows);
      })
      .catch(() => {
        if (!cancelled) setMemoryFacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const groupSummary = summariseMemory(memoryFacts);

  function run() {
    if (!destination.trim()) {
      setErr('Add a destination to plan a trip.');
      return;
    }
    setErr(null);
    setLoading(true);
    setData(null);
    runTripPlan({
      input: {
        destination: destination.trim(),
        duration: days,
        focus: focus.trim() || undefined,
        memoryFacts: memoryFacts.map((f) => ({ id: f.id, kind: f.kind, text: f.text })),
      },
    })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setLoading(false);
      });
  }

  return (
    <section
      className="trip-planner-card"
      aria-label="Trip planner"
      data-testid="trip-planner-card"
    >
      <header className="trip-planner-card__header">
        <h3 className="trip-planner-card__title">Trip planner</h3>
        <p className="trip-planner-card__subtitle" data-testid="trip-planner-context">
          Planning for: {groupSummary}
        </p>
      </header>

      <div className="trip-planner-card__form">
        <label className="trip-planner-card__field">
          <span>Destination</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Tokyo"
            data-testid="trip-planner-destination"
          />
        </label>
        <label className="trip-planner-card__field">
          <span>Days</span>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 1)}
            data-testid="trip-planner-days"
          />
        </label>
        <label className="trip-planner-card__field">
          <span>Focus (optional)</span>
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="kid-friendly, outdoor…"
            data-testid="trip-planner-focus"
          />
        </label>
        <button
          type="button"
          className="trip-planner-card__run"
          onClick={run}
          disabled={loading}
          data-testid="trip-planner-run"
        >
          {loading ? 'Planning…' : data ? 'Refresh itinerary' : 'Plan trip'}
        </button>
      </div>

      {err && (
        <div role="alert" className="trip-planner-card__error">
          {err}
        </div>
      )}

      {data && data.result.status === 'refused' && (
        <div role="alert" className="trip-planner-card__refusal" data-testid="trip-planner-refusal">
          {data.result.refusal.refusalText}
        </div>
      )}

      {data && data.result.status === 'ok' && (
        <>
          <p className="trip-planner-card__summary" data-testid="trip-planner-summary">
            {data.result.result.summary}
          </p>
          <ol className="trip-planner-card__days" data-testid="trip-planner-days-list">
            {data.result.result.days.map((d) => (
              <li key={d.day} className="trip-planner-card__day">
                <h4 className="trip-planner-card__day-title">
                  Day {d.day}
                  {d.weatherNote ? ` — ${d.weatherNote}` : ''}
                </h4>
                <ul className="trip-planner-card__items">
                  {d.items.map((item, i) => (
                    <li key={`${i}-${item.title}`} className="trip-planner-card__item">
                      <span className="trip-planner-card__item-title">{item.title}</span>
                      {item.detail && (
                        <span className="trip-planner-card__item-detail">{item.detail}</span>
                      )}
                      {item.sourceLabel && (
                        <span
                          className="trip-planner-card__item-source"
                          data-testid="trip-planner-item-source"
                        >
                          {item.sourceLabel}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <PrivacyStrip
            data={{
              computeLocation: data.result.privacy.computeLocation,
              modelName: data.result.privacy.modelName,
              sources: data.result.privacy.sources.map(toPrivacySource),
              dataEgressBytes: data.result.privacy.dataEgressBytes,
              confidence: data.result.confidence,
              whySuggested: data.result.privacy.reason,
              whyDetails: [
                { signal: `Routed to ${data.result.privacy.tier.toUpperCase()}` },
                {
                  signal: `Search service: ${data.weather.length} weather, ${data.events.length} events, ${data.attractions.length} attractions`,
                },
                { signal: 'Inference runs on-device only' },
              ],
              origin: {
                kind: 'thread',
                id: 'trip-planner',
                label: `Trip plan for ${data.result.result.destination}`,
              },
            }}
          />
        </>
      )}
    </section>
  );
}

function toPrivacySource(s: TripPlannerSkillSource): PrivacyStripSource {
  // The skill framework's source taxonomy includes 'tool' (for the
  // search service); the privacy strip taxonomy uses 'connector'. Map
  // here so the user sees a consistent vocabulary.
  const kind: PrivacyStripSource['kind'] =
    s.kind === 'tool' ? 'connector' : s.kind === 'memory' ? 'memory' : 'message';
  return { kind, id: s.id, label: s.label ?? s.id };
}

function summariseMemory(facts: MemoryFact[]): string {
  if (!facts || facts.length === 0) return 'no AI Memory facts yet';
  const location = facts.find((f) => f.kind === 'location')?.text;
  const memberCount = facts.filter((f) => f.kind === 'member').length;
  const community = facts.find((f) => f.kind === 'community-detail')?.text;
  const parts: string[] = [];
  if (memberCount > 0) parts.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
  if (community) parts.push(community);
  if (location) parts.push(`based in ${location}`);
  return parts.length === 0
    ? `${facts.length} memory fact${facts.length === 1 ? '' : 's'}`
    : parts.join(' · ');
}
