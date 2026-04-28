import { describe, expect, it } from 'vitest';
import { runTripPlanner, tripPlannerSkill } from '../skills/trip-planner.js';
import { MockSearchService, type SearchService } from '../search-service.js';
import { InferenceRouter } from '../router.js';
import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from '../adapter.js';

class CannedAdapter implements Adapter {
  public lastReq: InferenceRequest | null = null;
  constructor(public output: string, public modelLabel = 'gemma-4-e4b') {}
  name() {
    return 'canned';
  }
  async run(req: InferenceRequest): Promise<InferenceResponse> {
    this.lastReq = req;
    return {
      taskType: req.taskType,
      model: req.model || this.modelLabel,
      output: this.output,
      tokensUsed: 1,
      latencyMs: 1,
      onDevice: true,
    };
  }
  async *stream(): AsyncGenerator<StreamChunk, void, void> {
    yield { done: true };
  }
}

class EmptySearchService implements SearchService {
  async searchWeather() {
    return [];
  }
  async searchEvents() {
    return [];
  }
  async searchAttractions() {
    return [];
  }
}

const SAMPLE_OUTPUT = [
  'Day 1: Visit Senso-ji Temple in Asakusa | Easy walking loop, plenty of food | [Attraction: Senso-ji Temple in Asakusa]',
  'Day 1: Light dinner near Ueno | family-friendly | [Attraction: Ueno Park]',
  'Day 2: Sumida River fireworks viewing | Saturday evening | [Event: Sumida River fireworks viewing]',
  'Day 3: Reserve indoor backup, weather is uncertain | rainy day plan | [Weather]',
  'Summary: Three-day Tokyo trip mixing cultural sights with one outdoor evening event.',
].join('\n');

describe('tripPlannerSkill registry contract', () => {
  it('declares the required guardrails and tools', () => {
    expect(tripPlannerSkill.id).toBe('trip-planner');
    expect(tripPlannerSkill.guardrails.requireFields).toContain('destination');
    expect(tripPlannerSkill.guardrails.requireFields).toContain('duration');
    const toolIds = tripPlannerSkill.tools.map((t) => t.id);
    expect(toolIds).toContain('local:memory-read');
    expect(toolIds).toContain('remote:weather-search');
    expect(toolIds).toContain('remote:event-search');
    expect(toolIds).toContain('remote:attraction-search');
  });
});

describe('runTripPlanner', () => {
  it('returns a structured itinerary with on-device privacy metadata', async () => {
    const adapter = new CannedAdapter(SAMPLE_OUTPUT);
    const router = new InferenceRouter(adapter, adapter, null);
    const search = new MockSearchService();
    const exec = await runTripPlanner(router, search, {
      input: {
        destination: 'Tokyo',
        duration: 3,
        focus: 'kid-friendly',
        memoryFacts: [
          { id: 'fact_loc', kind: 'location', text: 'We live in Austin, TX.' },
          { id: 'fact_member', kind: 'member', text: 'Family of 4 — 2 adults, 2 kids age 8 / 11.' },
        ],
      },
    });
    expect(exec.result.status).toBe('ok');
    if (exec.result.status !== 'ok') return;
    const it = exec.result.result;
    expect(it.destination).toBe('Tokyo');
    expect(it.durationDays).toBe(3);
    expect(it.days.length).toBeGreaterThan(0);
    expect(it.days[0].items.length).toBeGreaterThan(0);
    expect(it.summary).toContain('Three-day');
    expect(exec.result.privacy.computeLocation).toBe('on_device');
    expect(exec.result.privacy.dataEgressBytes).toBe(0);
    expect(exec.result.privacy.tier === 'e2b' || exec.result.privacy.tier === 'e4b').toBe(true);
    // Prompt carries the AI Memory facts and search results.
    expect(adapter.lastReq?.prompt).toContain('Austin, TX');
    expect(adapter.lastReq?.prompt).toContain('Senso-ji');
  });

  it('refuses when the destination is missing', async () => {
    const adapter = new CannedAdapter('should not run');
    const router = new InferenceRouter(adapter, adapter, null);
    const search = new MockSearchService();
    const exec = await runTripPlanner(router, search, {
      input: { destination: '', duration: 3, memoryFacts: [] },
    });
    expect(exec.result.status).toBe('refused');
    if (exec.result.status !== 'refused') return;
    expect(exec.result.refusal.origin).toBe('pre_inference');
    expect(adapter.lastReq).toBeNull();
  });

  it('refuses when the duration is missing', async () => {
    const adapter = new CannedAdapter('should not run');
    const router = new InferenceRouter(adapter, adapter, null);
    const search = new MockSearchService();
    const exec = await runTripPlanner(router, search, {
      input: { destination: 'Tokyo', duration: 0, memoryFacts: [] },
    });
    expect(exec.result.status).toBe('refused');
    if (exec.result.status !== 'refused') return;
    expect(exec.result.refusal.origin).toBe('pre_inference');
  });

  it('refuses when the search service returns no data', async () => {
    const adapter = new CannedAdapter(SAMPLE_OUTPUT);
    const router = new InferenceRouter(adapter, adapter, null);
    const search = new EmptySearchService();
    const exec = await runTripPlanner(router, search, {
      input: { destination: 'Atlantis', duration: 2, memoryFacts: [] },
    });
    expect(exec.result.status).toBe('refused');
    if (exec.result.status !== 'refused') return;
    expect(exec.result.refusal.refusalText).toContain('search service');
    expect(adapter.lastReq).toBeNull();
  });

  it('honours an INSUFFICIENT response from the model', async () => {
    const adapter = new CannedAdapter('INSUFFICIENT: chat context is too sparse');
    const router = new InferenceRouter(adapter, adapter, null);
    const search = new MockSearchService();
    const exec = await runTripPlanner(router, search, {
      input: { destination: 'Tokyo', duration: 3, memoryFacts: [] },
    });
    expect(exec.result.status).toBe('refused');
    if (exec.result.status !== 'refused') return;
    expect(exec.result.refusal.origin).toBe('insufficient');
    expect(exec.result.refusal.reason).toContain('chat context');
  });

  it('queries the search service for weather, events, and attractions', async () => {
    const calls: string[] = [];
    const tracking: SearchService = {
      async searchWeather(loc) {
        calls.push(`weather:${loc}`);
        return [{ date: '2026-05-01', summary: 'sunny' }];
      },
      async searchEvents(loc) {
        calls.push(`events:${loc}`);
        return [];
      },
      async searchAttractions(loc) {
        calls.push(`attractions:${loc}`);
        return [
          {
            id: 'a1',
            name: 'Test Park',
            category: 'outdoor',
            description: 'demo',
            source: 'mock',
          },
        ];
      },
    };
    const adapter = new CannedAdapter(
      'Day 1: Visit Test Park | sunny day | [Attraction: Test Park]\nSummary: One day demo trip.',
    );
    const router = new InferenceRouter(adapter, adapter, null);
    const exec = await runTripPlanner(router, tracking, {
      input: { destination: 'Demo City', duration: 1, memoryFacts: [] },
    });
    expect(calls).toContain('weather:Demo City');
    expect(calls).toContain('events:Demo City');
    expect(calls).toContain('attractions:Demo City');
    expect(exec.result.status).toBe('ok');
  });
});
