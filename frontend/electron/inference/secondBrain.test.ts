import { describe, expect, it } from 'vitest';
import {
  parseChecklistItems,
  parseRSVPEvents,
  parseShoppingNudges,
  runEventRSVP,
  runFamilyChecklist,
  runShoppingNudges,
} from './secondBrain.js';
import { InferenceRouter } from './router.js';
import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

class CannedAdapter implements Adapter {
  public lastReq: InferenceRequest | null = null;
  constructor(public output: string, public modelLabel = 'gemma-4-e2b') {}
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

const FAMILY_MESSAGES = [
  { id: 'm1', channelId: 'fam', senderId: 'mom', content: 'Soccer practice tomorrow at 4pm.' },
  { id: 'm2', channelId: 'fam', senderId: 'dad', content: 'I will pick up the kids.' },
  { id: 'm3', channelId: 'fam', senderId: 'mom', content: 'We need to bring water and shin guards.' },
];

describe('parseChecklistItems', () => {
  it('parses pipe-separated items with due hints', () => {
    const out = `- Bring water bottles | tonight
- Pack shin guards | before practice
- Confirm carpool`;
    const items = parseChecklistItems(out, FAMILY_MESSAGES);
    expect(items.map((i) => i.title)).toEqual([
      'Bring water bottles',
      'Pack shin guards',
      'Confirm carpool',
    ]);
    expect(items[0].dueHint).toBe('tonight');
    expect(items[2].dueHint).toBeUndefined();
  });

  it('extracts due hints from a "(by …)" tail when no pipe is given', () => {
    const out = '- Pack shin guards (by tomorrow)';
    const items = parseChecklistItems(out, FAMILY_MESSAGES);
    expect(items[0].title).toBe('Pack shin guards');
    expect(items[0].dueHint).toBe('tomorrow');
  });

  it('drops empty / whitespace lines', () => {
    const out = '\n  \n- Bring water | tonight\n\n';
    expect(parseChecklistItems(out, FAMILY_MESSAGES)).toHaveLength(1);
  });

  it('matches a source message id by token overlap', () => {
    const out = '- Pack shin guards | before practice';
    const items = parseChecklistItems(out, FAMILY_MESSAGES);
    expect(items[0].sourceMessageId).toBe('m3');
  });
});

describe('runFamilyChecklist', () => {
  it('returns parsed items, on-device routing, and zero egress', async () => {
    const adapter = new CannedAdapter(
      '- Bring water bottles | tonight\n- Pack shin guards',
    );
    const router = new InferenceRouter(adapter, null, null);
    const resp = await runFamilyChecklist(router, {
      channelId: 'fam',
      messages: FAMILY_MESSAGES,
      eventHint: 'Soccer practice tomorrow',
    });
    expect(resp.items).toHaveLength(2);
    expect(resp.items[0].title).toBe('Bring water bottles');
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
    expect(resp.tier).toBe('e2b');
    expect(resp.title).toContain('Soccer practice tomorrow');
    // The prompt actually carried the event hint and chat content.
    expect(adapter.lastReq?.prompt ?? '').toContain('Soccer practice tomorrow');
    expect(adapter.lastReq?.prompt ?? '').toContain('shin guards');
  });

  it('falls back to a single placeholder when the model returns nothing useful', async () => {
    const adapter = new CannedAdapter('   \n   ');
    const router = new InferenceRouter(adapter, null, null);
    const resp = await runFamilyChecklist(router, {
      channelId: 'fam',
      messages: FAMILY_MESSAGES,
    });
    expect(resp.items).toHaveLength(1);
    expect(resp.items[0].title).toContain('Review');
  });

  it('throws when no messages are supplied', async () => {
    const adapter = new CannedAdapter('');
    const router = new InferenceRouter(adapter, null, null);
    await expect(
      runFamilyChecklist(router, { channelId: 'fam', messages: [] }),
    ).rejects.toThrow();
  });
});

const SHOPPING_MESSAGES = [
  {
    id: 'm1',
    channelId: 'fam',
    senderId: 'mom',
    content: 'Field trip on Friday — bring sunscreen.',
  },
  { id: 'm2', channelId: 'fam', senderId: 'dad', content: 'We are out of milk again.' },
];

describe('parseShoppingNudges', () => {
  it('returns item + reason pairs', () => {
    const out = '- Sunscreen | Field trip is Friday\n- Milk | We are out';
    const nudges = parseShoppingNudges(out, SHOPPING_MESSAGES);
    expect(nudges).toEqual([
      expect.objectContaining({ item: 'Sunscreen', reason: 'Field trip is Friday' }),
      expect.objectContaining({ item: 'Milk', reason: 'We are out' }),
    ]);
  });

  it('caps at 5 nudges', () => {
    const out = Array.from({ length: 8 }, (_, i) => `- Item${i} | reason ${i}`).join('\n');
    const nudges = parseShoppingNudges(out, SHOPPING_MESSAGES);
    expect(nudges).toHaveLength(5);
  });

  it('skips lines without a reason', () => {
    const out = '- Sunscreen\n- Milk | We are out';
    const nudges = parseShoppingNudges(out, SHOPPING_MESSAGES);
    expect(nudges).toEqual([expect.objectContaining({ item: 'Milk' })]);
  });
});

describe('runShoppingNudges', () => {
  it('filters out items already on the existing list (case-insensitive)', async () => {
    const adapter = new CannedAdapter(
      '- Sunscreen | field trip Friday\n- Milk | we are out',
    );
    const router = new InferenceRouter(adapter, null, null);
    const resp = await runShoppingNudges(router, {
      channelId: 'fam',
      messages: SHOPPING_MESSAGES,
      existingItems: ['MILK'],
    });
    expect(resp.nudges.map((n) => n.item)).toEqual(['Sunscreen']);
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
  });

  it('passes the existing list into the prompt so the model can dedupe too', async () => {
    const adapter = new CannedAdapter('');
    const router = new InferenceRouter(adapter, null, null);
    await runShoppingNudges(router, {
      channelId: 'fam',
      messages: SHOPPING_MESSAGES,
      existingItems: ['Bananas'],
    });
    expect(adapter.lastReq?.prompt ?? '').toContain('Bananas');
  });
});

const RSVP_MESSAGES = [
  {
    id: 'm1',
    channelId: 'comm',
    senderId: 'pta',
    content: 'PTA potluck Saturday 3pm at the school gym. RSVP by Friday.',
  },
  {
    id: 'm2',
    channelId: 'comm',
    senderId: 'coach',
    content: 'Soccer parents meeting Tuesday at 7pm.',
  },
];

describe('parseRSVPEvents', () => {
  it('parses title | when | location | rsvpBy', () => {
    const out = '- PTA potluck | Saturday 3pm | School gym | Friday';
    const events = parseRSVPEvents(out, RSVP_MESSAGES);
    expect(events[0]).toMatchObject({
      title: 'PTA potluck',
      whenHint: 'Saturday 3pm',
      location: 'School gym',
      rsvpBy: 'Friday',
    });
  });

  it('keeps events without a location/rsvpBy', () => {
    const out = '- Soccer meeting | Tuesday 7pm';
    const events = parseRSVPEvents(out, RSVP_MESSAGES);
    expect(events[0]).toMatchObject({ title: 'Soccer meeting', whenHint: 'Tuesday 7pm' });
    expect(events[0].location).toBeUndefined();
    expect(events[0].rsvpBy).toBeUndefined();
  });

  it('drops lines without a when hint', () => {
    const out = '- Lonely event\n- Real event | Saturday';
    expect(parseRSVPEvents(out, RSVP_MESSAGES)).toHaveLength(1);
  });

  it('caps at 4 events', () => {
    const out = Array.from({ length: 6 }, (_, i) => `- ev${i} | day${i}`).join('\n');
    expect(parseRSVPEvents(out, RSVP_MESSAGES)).toHaveLength(4);
  });
});

describe('runEventRSVP', () => {
  it('returns events tagged with on-device routing', async () => {
    const adapter = new CannedAdapter(
      '- PTA potluck | Saturday 3pm | School gym | Friday\n- Soccer meeting | Tuesday 7pm',
    );
    const router = new InferenceRouter(adapter, null, null);
    const resp = await runEventRSVP(router, {
      channelId: 'comm',
      messages: RSVP_MESSAGES,
    });
    expect(resp.events).toHaveLength(2);
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
    expect(resp.events[0].sourceMessageId).toBeTruthy();
  });
});
