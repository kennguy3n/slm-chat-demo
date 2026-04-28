// Search service interface used by the trip-planner skill. The Phase-2
// demo wires `MockSearchService` so the skill always has realistic data
// to plan around without making any network calls. The interface is
// shaped to admit a real server-side implementation in Phase 6 (the
// confidential-server mode in PROPOSAL.md §6) without changing any
// callers — the response shapes are JSON-serialisable and deliberately
// avoid request-context-only fields that would be hard to honour
// remotely.

export interface DateRange {
  // ISO-8601 yyyy-mm-dd. The mock implementation tolerates any string
  // (it does not parse the dates) and surfaces them verbatim in the
  // results so the skill can attribute weather notes to the requested
  // window.
  start: string;
  end: string;
}

export interface WeatherResult {
  date: string;
  // Free-form summary like "sunny, 72°F" or "light rain". Kept as a
  // single string so the SLM can quote it directly without juggling
  // numeric units.
  summary: string;
  highF?: number;
  lowF?: number;
}

export interface EventResult {
  id: string;
  title: string;
  date: string;
  // Optional time-of-day hint ("morning", "evening", "Sat 10am").
  whenHint?: string;
  category?: string;
  venue?: string;
  // Source attribution surfaced through the privacy strip when the
  // trip-planner cites this event.
  source: string;
}

export interface AttractionResult {
  id: string;
  name: string;
  category: string;
  // Plain-English description (≤ 200 chars).
  description: string;
  source: string;
}

export interface SearchService {
  searchWeather(location: string, dates: DateRange): Promise<WeatherResult[]>;
  searchEvents(
    location: string,
    dates: DateRange,
    categories?: string[],
  ): Promise<EventResult[]>;
  searchAttractions(location: string): Promise<AttractionResult[]>;
}

// ---------- mock implementation ----------

// Canned data keyed by lower-cased location prefix. We deliberately use
// a small dictionary so the demo always has *something* useful for the
// most common destinations a tester will type. Unknown locations fall
// through to a generic set so the skill is never starved of search
// signal during a live demo.
const MOCK_ATTRACTIONS: Record<string, AttractionResult[]> = {
  tokyo: [
    {
      id: 'tokyo-teamlab',
      name: 'teamLab Planets',
      category: 'museum',
      description: 'Immersive digital art experience kids and adults both enjoy.',
      source: 'mock:attractions:tokyo',
    },
    {
      id: 'tokyo-ueno-park',
      name: 'Ueno Park',
      category: 'outdoor',
      description: 'Wide green park with the zoo and several museums on-site.',
      source: 'mock:attractions:tokyo',
    },
    {
      id: 'tokyo-asakusa',
      name: 'Senso-ji Temple in Asakusa',
      category: 'cultural',
      description: 'Historic temple and street food market; easy walking loop.',
      source: 'mock:attractions:tokyo',
    },
  ],
  paris: [
    {
      id: 'paris-eiffel',
      name: 'Eiffel Tower',
      category: 'landmark',
      description: 'Iconic tower with skip-the-line tickets recommended.',
      source: 'mock:attractions:paris',
    },
    {
      id: 'paris-luxembourg',
      name: 'Jardin du Luxembourg',
      category: 'outdoor',
      description: 'Family-friendly gardens with a sailboat pond.',
      source: 'mock:attractions:paris',
    },
  ],
  austin: [
    {
      id: 'austin-zilker',
      name: 'Zilker Park',
      category: 'outdoor',
      description: 'Large urban park with a swimming hole at Barton Springs.',
      source: 'mock:attractions:austin',
    },
    {
      id: 'austin-children-museum',
      name: "Thinkery Children's Museum",
      category: 'museum',
      description: 'Hands-on STEAM exhibits for kids 0–12.',
      source: 'mock:attractions:austin',
    },
  ],
};

const MOCK_GENERIC_ATTRACTIONS: AttractionResult[] = [
  {
    id: 'generic-walking-tour',
    name: 'Self-guided downtown walking tour',
    category: 'outdoor',
    description: 'Loop through the main square and any historic district.',
    source: 'mock:attractions:generic',
  },
  {
    id: 'generic-public-market',
    name: 'Public market or food hall',
    category: 'food',
    description: 'Grazing-friendly lunch stop with vegetarian options.',
    source: 'mock:attractions:generic',
  },
];

const MOCK_EVENTS: Record<string, EventResult[]> = {
  tokyo: [
    {
      id: 'tokyo-evt-1',
      title: 'Sumida River fireworks viewing',
      date: '',
      whenHint: 'Saturday evening',
      category: 'festival',
      venue: 'Sumida River',
      source: 'mock:events:tokyo',
    },
  ],
  austin: [
    {
      id: 'austin-evt-1',
      title: 'Austin Symphony in the Park',
      date: '',
      whenHint: 'Sunday afternoon',
      category: 'music',
      venue: 'Zilker Park',
      source: 'mock:events:austin',
    },
  ],
};

function lookupKey(location: string): string {
  return location.trim().toLowerCase().split(/[\s,]+/)[0] ?? '';
}

export class MockSearchService implements SearchService {
  // Mock weather fans out a 3–5 day window around the start date with
  // alternating "sunny" / "partly cloudy" / "light rain" notes. The
  // skill's privacy strip cites these as `mock:weather` so the user can
  // tell on-device search from a real server-backed lookup.
  async searchWeather(location: string, dates: DateRange): Promise<WeatherResult[]> {
    if (!location.trim()) return [];
    const days = enumerateDates(dates).slice(0, 7);
    if (days.length === 0) {
      return [
        {
          date: dates.start || 'day-1',
          summary: 'sunny, 72°F',
          highF: 72,
          lowF: 58,
        },
      ];
    }
    const summaries = ['sunny, 72°F', 'partly cloudy, 68°F', 'light rain, 64°F'];
    return days.map((d, i) => ({
      date: d,
      summary: summaries[i % summaries.length],
      highF: 72 - (i % 3) * 4,
      lowF: 58 - (i % 3) * 4,
    }));
  }

  async searchEvents(
    location: string,
    _dates: DateRange,
    categories?: string[],
  ): Promise<EventResult[]> {
    const key = lookupKey(location);
    const all = MOCK_EVENTS[key] ?? [];
    if (!categories || categories.length === 0) return all;
    const want = new Set(categories.map((c) => c.toLowerCase()));
    return all.filter((e) => (e.category ? want.has(e.category.toLowerCase()) : false));
  }

  async searchAttractions(location: string): Promise<AttractionResult[]> {
    const key = lookupKey(location);
    return MOCK_ATTRACTIONS[key] ?? MOCK_GENERIC_ATTRACTIONS;
  }
}

// enumerateDates generates yyyy-mm-dd strings for [start, end] inclusive.
// If parsing fails, it returns the start string verbatim so the mock
// degrades gracefully against any free-form date input.
function enumerateDates(range: DateRange): string[] {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  if (!start || !end || end.getTime() < start.getTime()) {
    return range.start ? [range.start] : [];
  }
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime() && out.length < 14) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
