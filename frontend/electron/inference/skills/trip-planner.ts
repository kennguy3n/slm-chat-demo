// Trip-planner skill — Phase 2 B2C surface that turns a destination +
// duration + (optional) date range / focus into a structured itinerary.
// Reads the user's local AI Memory for location, member count, member
// roles, and preferences, then queries the on-device search service for
// weather + events + attractions and asks the SLM to weave them into a
// day-by-day plan with source attribution.
//
// Privacy: the skill never echoes memory facts back to the renderer
// outside of the assembled prompt, and search-service results are
// labelled in the privacy strip as separate sources from chat messages.
// Inference itself is on-device with 0 B egress.

import {
  GuardrailError,
  INSUFFICIENT_RULE,
  detectInsufficient,
  registerSkill,
  runPostInferenceGuardrails,
  runPreInferenceGuardrails,
  type SkillDefinition,
  type SkillParseResult,
  type SkillResult,
  type SkillSource,
} from '../skill-framework.js';
import type { InferenceRouter } from '../router.js';
import type {
  AttractionResult,
  DateRange,
  EventResult,
  SearchService,
  WeatherResult,
} from '../search-service.js';

// ---------- public types ----------

export interface MemoryFactInput {
  id: string;
  kind: string; // matches MemoryFactKind on the renderer
  text: string;
}

export interface TripPlannerInput {
  destination: string;
  duration: number; // days
  dateRange?: DateRange;
  focus?: string; // e.g. "kid-friendly", "outdoor"
  memoryFacts: MemoryFactInput[];
}

export interface ItineraryItem {
  title: string;
  detail?: string;
  sourceLabel?: string;
  sourceId?: string;
}

export interface ItineraryDay {
  day: number;
  weatherNote?: string;
  items: ItineraryItem[];
}

export interface TripItinerary {
  destination: string;
  durationDays: number;
  summary: string;
  days: ItineraryDay[];
  // Search-service attributions surfaced separately from chat sources.
  weatherSources: string[];
  eventSources: string[];
  attractionSources: string[];
  // Memory fact ids the prompt actually used (for privacy-strip clarity).
  memorySources: string[];
}

// ---------- skill definition ----------

const TRIP_PLANNER_META = [
  'You are a trip planning assistant for a family or community.',
  'You help plan trips by considering the group\'s composition, location,',
  'preferences, and the specific weather / events / attractions provided.',
  '',
  '[USER_CONTEXT_SLOT]',
  '',
  'Hard rules:',
  '- Do not invent attractions, events, or weather. If the search results',
  '  are empty for a category, say so for that category instead.',
  '- Cite each itinerary item with the exact source label provided',
  '  (e.g. "[Weather]", "[Event: Sumida River fireworks viewing]",',
  '  "[Attraction: teamLab Planets]", or "[Memory]").',
  '- Output one Markdown line per item, prefixed by the day:',
  '  Day <N>: <title> | <short detail> | <source>',
  '- After the final day write one line:',
  '  Summary: <one-sentence overview>',
  '- Skip days you cannot ground in the provided data.',
  '[INPUT_SLOT]',
].join('\n');

export const tripPlannerSkill: SkillDefinition<TripPlannerInput, TripItinerary> = {
  id: 'trip-planner',
  name: 'Trip planner',
  description:
    'Plans a family/community trip using on-device memory + the local search service.',
  metaPrompt: TRIP_PLANNER_META,
  steps: [
    { order: 1, action: 'read_memory', description: 'Read local AI Memory for user context.' },
    {
      order: 2,
      action: 'remote:weather-search',
      description: 'Query the search service for weather at the destination.',
    },
    {
      order: 3,
      action: 'remote:event-search',
      description: 'Query the search service for events during the date range.',
    },
    {
      order: 4,
      action: 'remote:attraction-search',
      description: 'Query the search service for attractions at the destination.',
    },
    { order: 5, action: 'build_prompt', description: 'Assemble the itinerary prompt.' },
    { order: 6, action: 'run_inference', description: 'Run inference via the router.' },
    { order: 7, action: 'parse_output', description: 'Parse into an itinerary structure.' },
    { order: 8, action: 'validate', description: 'Run post-inference guardrails.' },
  ],
  tools: [
    {
      id: 'local:memory-read',
      type: 'local',
      description: 'Read local AI Memory for location/member/preference facts.',
      required: false,
    },
    {
      id: 'remote:weather-search',
      type: 'remote',
      description: 'Search for weather at the destination during the date range.',
      required: false,
    },
    {
      id: 'remote:event-search',
      type: 'remote',
      description: 'Search for events at the destination during the date range.',
      required: false,
    },
    {
      id: 'remote:attraction-search',
      type: 'remote',
      description: 'Search for attractions at the destination.',
      required: false,
    },
  ],
  guardrails: {
    requireFields: ['destination', 'duration'],
    confidenceThreshold: 0.5,
    refusalTemplate:
      "I can't {action} yet — {reason}. Add a destination and duration, and add a few facts (location, members) to AI Memory so the plan reflects your group.",
    requireSourceAttribution: true,
  },
  responseTemplate: {
    format: 'itinerary',
    requiredFields: ['destination', 'durationDays', 'days', 'summary'],
    maxItems: 14,
  },
  preferredTier: 'e4b',
  taskType: 'draft_artifact',
  parser(rawOutput, input): SkillParseResult<TripItinerary> {
    return parseItinerary(rawOutput, input);
  },
  buildInputPrompt(input) {
    return buildInputBody(input, { weather: [], events: [], attractions: [] });
  },
};

registerSkill(tripPlannerSkill as SkillDefinition<unknown, unknown>);

// ---------- public runner ----------

export interface RunTripPlannerArgs {
  input: TripPlannerInput;
  channelId?: string;
}

export interface TripPlannerExecution {
  weather: WeatherResult[];
  events: EventResult[];
  attractions: AttractionResult[];
  result: SkillResult<TripItinerary>;
  prompt: string;
}

// runTripPlanner runs the full skill end-to-end: it reads search-service
// results, builds the prompt manually (so the renderer can always show
// the weather/events/attractions even when the SLM refuses), and invokes
// the router. We intentionally bypass the generic `runSkill` executor
// here because the prompt requires data that is only available after
// the search-service round trip — but we still re-use the framework's
// guardrail helpers for symmetry.
export async function runTripPlanner(
  router: InferenceRouter,
  search: SearchService,
  args: RunTripPlannerArgs,
): Promise<TripPlannerExecution> {
  const { input, channelId } = args;

  // 1. Pre-inference guardrails. Duration is a number, so the generic
  // requireFields check treats 0 the same as a non-blank value — guard
  // it explicitly here.
  try {
    runPreInferenceGuardrails(tripPlannerSkill, input);
    if (!Number.isFinite(input.duration) || input.duration <= 0) {
      throw new GuardrailError(
        'trip planner requires duration to be at least 1 day.',
        'pre_inference',
      );
    }
  } catch (e) {
    return refusalFromError(input, e, { weather: [], events: [], attractions: [] });
  }

  // 2. Run the search service. Weather is optional but expected; events
  // and attractions can be empty without halting the plan.
  const range = input.dateRange ?? deriveRange(input.duration);
  const [weather, events, attractions] = await Promise.all([
    safe(() => search.searchWeather(input.destination, range)),
    safe(() =>
      search.searchEvents(input.destination, range, input.focus ? [input.focus] : undefined),
    ),
    safe(() => search.searchAttractions(input.destination)),
  ]);

  // 3. If every search bucket is empty, refuse with a clear reason —
  // the skill's contract says the model must not invent attractions.
  if (weather.length === 0 && events.length === 0 && attractions.length === 0) {
    return refusalFromError(
      input,
      new GuardrailError(
        `the search service returned no weather, events, or attractions for ${input.destination}.`,
        'pre_inference',
      ),
      { weather, events, attractions },
    );
  }

  // 4. Build the full prompt.
  const userContext = buildUserContextSlot(input.memoryFacts);
  const inputBody = buildInputBody(input, { weather, events, attractions });
  let prompt = `${INSUFFICIENT_RULE}\n\n`;
  prompt += tripPlannerSkill.metaPrompt
    .replace('[USER_CONTEXT_SLOT]', userContext || '(no AI Memory facts on file)')
    .replace('[INPUT_SLOT]', `\n${inputBody}`);

  // 5. Inference.
  let rawOutput = '';
  let model = '';
  let tier: 'e2b' | 'e4b' = tripPlannerSkill.preferredTier;
  let routeReason = '';
  try {
    const resp = await router.run({
      taskType: tripPlannerSkill.taskType,
      prompt,
      channelId,
    });
    rawOutput = resp.output ?? '';
    model = resp.model;
    const decision = router.lastDecision();
    if (decision.tier) tier = decision.tier;
    routeReason = decision.reason;
  } catch (e) {
    return {
      weather,
      events,
      attractions,
      prompt,
      result: makeRefusalResult(input, e, 'pre_inference'),
    };
  }

  // 6. INSUFFICIENT detection.
  const insufficient = detectInsufficient(rawOutput);
  if (insufficient) {
    return {
      weather,
      events,
      attractions,
      prompt,
      result: {
        status: 'refused',
        skillId: tripPlannerSkill.id,
        refusal: {
          reason: insufficient,
          origin: 'insufficient',
          refusalText: tripPlannerSkill.guardrails.refusalTemplate
            .replace('{action}', 'plan this trip')
            .replace('{reason}', insufficient),
        },
        privacy: {
          computeLocation: 'on_device',
          modelName: model || `gemma-4-${tier}`,
          tier,
          reason: routeReason || `Routed trip planner to ${tier.toUpperCase()}.`,
          dataEgressBytes: 0,
          sources: [],
        },
      },
    };
  }

  // 7. Parse + post-inference guardrails.
  let parsed: SkillParseResult<TripItinerary>;
  try {
    parsed = parseItinerary(rawOutput, input, { weather, events, attractions });
  } catch (e) {
    return {
      weather,
      events,
      attractions,
      prompt,
      result: makeRefusalResult(input, e, 'parse_failed'),
    };
  }
  try {
    runPostInferenceGuardrails(tripPlannerSkill, rawOutput, parsed);
  } catch (e) {
    return {
      weather,
      events,
      attractions,
      prompt,
      result: makeRefusalResult(input, e, 'post_inference'),
    };
  }

  return {
    weather,
    events,
    attractions,
    prompt,
    result: {
      status: 'ok',
      skillId: tripPlannerSkill.id,
      result: parsed.result,
      sources: parsed.sources,
      confidence: parsed.confidence ?? 1,
      rawOutput,
      privacy: {
        computeLocation: 'on_device',
        modelName: model || `gemma-4-${tier}`,
        tier,
        reason:
          routeReason ||
          `Routed trip planner to ${tier.toUpperCase()} (search service results provided externally).`,
        dataEgressBytes: 0,
        sources: parsed.sources,
      },
    },
  };
}

// ---------- helpers ----------

function buildUserContextSlot(memoryFacts: MemoryFactInput[]): string {
  if (!memoryFacts || memoryFacts.length === 0) return '';
  const groups = new Map<string, string[]>();
  for (const f of memoryFacts) {
    const list = groups.get(f.kind) ?? [];
    list.push(`- ${f.text} [Memory:${f.id}]`);
    groups.set(f.kind, list);
  }
  const sections: string[] = ['User context (from local AI Memory; never leaves the device):'];
  for (const [kind, lines] of groups) {
    sections.push(`${labelForKind(kind)}:`);
    sections.push(...lines);
  }
  return sections.join('\n');
}

function labelForKind(kind: string): string {
  switch (kind) {
    case 'location':
      return 'Home location';
    case 'member':
      return 'Members';
    case 'community-detail':
      return 'Community detail';
    case 'preference':
      return 'Preferences';
    case 'routine':
      return 'Routines';
    case 'note':
      return 'Notes';
    case 'person':
      return 'People';
    default:
      return kind;
  }
}

function buildInputBody(
  input: TripPlannerInput,
  search: { weather: WeatherResult[]; events: EventResult[]; attractions: AttractionResult[] },
): string {
  const parts: string[] = [];
  parts.push(`Destination: ${input.destination}`);
  parts.push(`Duration: ${input.duration} day(s)`);
  if (input.dateRange) {
    parts.push(`Dates: ${input.dateRange.start} → ${input.dateRange.end}`);
  }
  if (input.focus) parts.push(`Focus: ${input.focus}`);
  parts.push('');
  parts.push('Weather forecast (may be empty):');
  if (search.weather.length === 0) parts.push('- (none)');
  else for (const w of search.weather) parts.push(`- ${w.date}: ${w.summary} [Weather]`);
  parts.push('');
  parts.push('Events (may be empty):');
  if (search.events.length === 0) parts.push('- (none)');
  else
    for (const e of search.events) {
      const when = e.whenHint ? `, ${e.whenHint}` : '';
      const venue = e.venue ? `, ${e.venue}` : '';
      parts.push(`- ${e.title}${when}${venue} [Event: ${e.title}]`);
    }
  parts.push('');
  parts.push('Attractions (may be empty):');
  if (search.attractions.length === 0) parts.push('- (none)');
  else
    for (const a of search.attractions) {
      parts.push(`- ${a.name} (${a.category}) — ${a.description} [Attraction: ${a.name}]`);
    }
  return parts.join('\n');
}

function deriveRange(duration: number): DateRange {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(0, duration - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    const v = await fn();
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

interface ParserSearchContext {
  weather: WeatherResult[];
  events: EventResult[];
  attractions: AttractionResult[];
}

function parseItinerary(
  rawOutput: string,
  input: TripPlannerInput,
  searchCtx: ParserSearchContext = { weather: [], events: [], attractions: [] },
): SkillParseResult<TripItinerary> {
  const lines = rawOutput.split('\n').map((l) => l.trim());
  const days = new Map<number, ItineraryDay>();
  let summary = '';

  const eventByLabel = new Map<string, EventResult>();
  for (const e of searchCtx.events) eventByLabel.set(e.title.toLowerCase(), e);
  const attractionByLabel = new Map<string, AttractionResult>();
  for (const a of searchCtx.attractions) attractionByLabel.set(a.name.toLowerCase(), a);
  const memoryById = new Map<string, MemoryFactInput>();
  for (const m of input.memoryFacts) memoryById.set(m.id, m);

  for (const raw of lines) {
    const line = raw.replace(/^[-*•·\s\t]+/, '');
    if (!line) continue;
    const summaryMatch = line.match(/^summary\s*:\s*(.+)$/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
      continue;
    }
    const dayMatch = line.match(/^day\s*(\d+)\s*:?\s*(.+)$/i);
    if (!dayMatch) continue;
    const dayNum = Number(dayMatch[1]);
    if (!Number.isInteger(dayNum) || dayNum < 1) continue;
    const body = dayMatch[2];
    const parts = body.split('|').map((p) => p.trim());
    if (parts.length === 0 || !parts[0]) continue;
    const title = stripQuotes(parts[0]);
    const detail = parts.length >= 2 && parts[1] && !parts[1].startsWith('[') ? parts[1] : undefined;
    const sourceTag = parts.find((p) => p.startsWith('[') && p.endsWith(']'));
    const itineraryItem: ItineraryItem = { title, ...(detail ? { detail } : {}) };
    if (sourceTag) {
      const tag = sourceTag.slice(1, -1).trim();
      itineraryItem.sourceLabel = tag;
      if (/^event\s*:/i.test(tag)) {
        const name = tag.replace(/^event\s*:/i, '').trim().toLowerCase();
        const evt = eventByLabel.get(name);
        if (evt) itineraryItem.sourceId = evt.id;
      } else if (/^attraction\s*:/i.test(tag)) {
        const name = tag.replace(/^attraction\s*:/i, '').trim().toLowerCase();
        const a = attractionByLabel.get(name);
        if (a) itineraryItem.sourceId = a.id;
      } else if (/^memory(:|$)/i.test(tag)) {
        const m = tag.match(/memory\s*:?\s*([\w-]+)/i);
        if (m && memoryById.has(m[1])) itineraryItem.sourceId = m[1];
      }
    }
    const existing = days.get(dayNum) ?? { day: dayNum, items: [] };
    existing.items.push(itineraryItem);
    if (!existing.weatherNote) {
      const weatherForDay = searchCtx.weather[dayNum - 1];
      if (weatherForDay) existing.weatherNote = weatherForDay.summary;
    }
    days.set(dayNum, existing);
  }

  const sortedDays = Array.from(days.values()).sort((a, b) => a.day - b.day);

  // If we have no parsed days at all but we had search results, build a
  // light fallback from the search results so the renderer can still
  // render the on-device data alongside a parse-failed flag.
  let parseFailed = false;
  if (sortedDays.length === 0) {
    parseFailed = true;
  }

  // Confidence: how many days got at least one item, normalised by
  // requested duration.
  const grounded = sortedDays.filter((d) => d.items.length > 0).length;
  const confidence = input.duration > 0 ? grounded / Math.max(1, input.duration) : 0;

  const sources: SkillSource[] = [];
  for (const m of input.memoryFacts) sources.push({ kind: 'memory', id: m.id, label: m.text });
  for (const w of searchCtx.weather) sources.push({ kind: 'tool', id: `weather:${w.date}` });
  for (const e of searchCtx.events) sources.push({ kind: 'tool', id: e.id, label: e.title });
  for (const a of searchCtx.attractions) sources.push({ kind: 'tool', id: a.id, label: a.name });

  return {
    result: {
      destination: input.destination,
      durationDays: input.duration,
      summary,
      days: sortedDays,
      weatherSources: searchCtx.weather.map((w) => `weather:${w.date}`),
      eventSources: searchCtx.events.map((e) => e.id),
      attractionSources: searchCtx.attractions.map((a) => a.id),
      memorySources: input.memoryFacts.map((m) => m.id),
    },
    sources,
    confidence,
    parseFailed,
  };
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '');
}

function refusalFromError(
  input: TripPlannerInput,
  e: unknown,
  search: ParserSearchContext,
): TripPlannerExecution {
  return {
    weather: search.weather,
    events: search.events,
    attractions: search.attractions,
    prompt: '',
    result: makeRefusalResult(input, e),
  };
}

function makeRefusalResult(
  _input: TripPlannerInput,
  e: unknown,
  fallbackOrigin:
    | 'pre_inference'
    | 'insufficient'
    | 'post_inference'
    | 'parse_failed' = 'pre_inference',
): SkillResult<TripItinerary> {
  const reason = e instanceof Error ? e.message : 'unknown error during trip planning';
  const origin = e instanceof GuardrailError ? e.origin : fallbackOrigin;
  const refusalText = tripPlannerSkill.guardrails.refusalTemplate
    .replace('{action}', 'plan this trip')
    .replace('{reason}', reason);
  return {
    status: 'refused',
    skillId: tripPlannerSkill.id,
    refusal: { reason, origin, refusalText },
    privacy: null,
  };
}
