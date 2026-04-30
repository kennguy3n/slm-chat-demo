import { describe, expect, it } from 'vitest';
import {
  buildDraftArtifact,
  parseBatchTranslations,
  parseKAppsExtractedTasks,
  parsePrefilledApprovalFields,
  runPrefillApproval,
  runTranslateBatch,
} from './tasks.js';
import { InferenceRouter } from './router.js';
import { MockAdapter } from './mock.js';

function makeRouter() {
  return new InferenceRouter(null, new MockAdapter());
}

describe('parsePrefilledApprovalFields', () => {
  it('parses canonical key: value pairs', () => {
    const out = [
      'vendor: Acme Logs',
      'amount: $42,000 / yr',
      'justification: Lowest-cost SOC 2-cleared bidder.',
      'risk: medium',
    ].join('\n');
    expect(parsePrefilledApprovalFields(out)).toEqual({
      vendor: 'Acme Logs',
      amount: '$42,000 / yr',
      justification: 'Lowest-cost SOC 2-cleared bidder.',
      risk: 'medium',
    });
  });

  it('strips bullet prefixes and surrounding quotes', () => {
    const out = ['- vendor: "Acme"', '* amount: $1', '• risk: low'].join('\n');
    expect(parsePrefilledApprovalFields(out)).toEqual({
      vendor: 'Acme',
      amount: '$1',
      risk: 'low',
    });
  });

  it('captures unknown keys as extra', () => {
    const out = 'vendor: Acme\ncontract length: 12 months\nrisk: low';
    const fields = parsePrefilledApprovalFields(out);
    expect(fields.vendor).toBe('Acme');
    expect(fields.risk).toBe('low');
    expect(fields.extra).toEqual({ 'contract length': '12 months' });
  });

  it('skips blank lines and lines without a colon', () => {
    const out = '\nvendor: Acme\nthis line has no colon\n\namount: $99\n';
    expect(parsePrefilledApprovalFields(out)).toEqual({
      vendor: 'Acme',
      amount: '$99',
    });
  });
});

describe('runPrefillApproval', () => {
  it('returns prefilled fields, sources, on-device metadata, and a local-tier reason', async () => {
    const router = makeRouter();
    const resp = await runPrefillApproval(router, {
      threadId: 't1',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'We picked Acme Logs at $42,000/yr.' },
        { id: 'm2', channelId: 'c1', senderId: 'u2', content: 'Risk medium since SOC 2 is current.' },
      ],
    });
    expect(resp.threadId).toBe('t1');
    expect(resp.channelId).toBe('c1');
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
    expect(resp.fields.vendor).toBe('Acme Logs');
    expect(resp.fields.amount).toBe('$42,000 / yr');
    expect(resp.fields.risk).toBe('medium');
    expect(resp.title).toContain('Acme Logs');
    expect(resp.sourceMessageIds.length).toBeGreaterThan(0);
    expect(resp.tier).toBe('local');
    expect(typeof resp.reason).toBe('string');
  });

  it('throws when the thread has no messages', async () => {
    const router = makeRouter();
    await expect(
      runPrefillApproval(router, { threadId: 't', messages: [] }),
    ).rejects.toThrow(/thread/);
  });

  it('respects the templateId passed by the caller', async () => {
    const router = makeRouter();
    const resp = await runPrefillApproval(router, {
      threadId: 't1',
      templateId: 'access',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'Need access for the new contractor.' },
      ],
    });
    expect(resp.templateId).toBe('access');
  });
});

describe('buildDraftArtifact', () => {
  it('builds a prompt that lists every message and includes the artifact type/section hint', () => {
    const router = makeRouter();
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'PRD',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'Need inline translation.' },
        { id: 'm2', channelId: 'c1', senderId: 'u2', content: 'On-device only.' },
      ],
    });
    expect(out.prompt).toContain('PRD');
    expect(out.prompt).toContain('product requirements');
    expect(out.prompt).toContain('Need inline translation');
    expect(out.prompt).toContain('On-device only');
    expect(out.sources).toHaveLength(2);
    expect(out.threadId).toBe('t1');
    expect(out.channelId).toBe('c1');
    expect(out.computeLocation).toBe('on_device');
    expect(out.dataEgressBytes).toBe(0);
    expect(out.title).toContain('PRD');
    expect(out.section).toBe('all');
    expect(out.messageCount).toBe(2);
  });

  it('routes PRD threads to the local tier', () => {
    const router = makeRouter();
    const messages = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`,
      channelId: 'c1',
      senderId: `u${i}`,
      content: `message ${i}`,
    }));
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'PRD',
      messages,
    });
    expect(out.tier).toBe('local');
  });

  it('honours the router decision when an adapter is wired in', () => {
    // Even a short SOP thread defers to the router, which routes
    // draft_artifact to the on-device tier. The
    // length-based fallback only matters when the router declines.
    const router = makeRouter();
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'SOP',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'How to rotate keys.' },
      ],
    });
    expect(out.tier).toBe('local');
    expect(out.reason.length).toBeGreaterThan(0);
  });

  it('honours the requested section in the prompt', () => {
    const router = makeRouter();
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'PRD',
      section: 'risks',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'There is a privacy risk.' },
      ],
    });
    expect(out.section).toBe('risks');
    expect(out.prompt).toContain('risks');
  });

  it('throws when the thread is empty', () => {
    const router = makeRouter();
    expect(() =>
      buildDraftArtifact(router, { threadId: 't', artifactType: 'PRD', messages: [] }),
    ).toThrow(/thread/);
  });
});

describe('parseKAppsExtractedTasks', () => {
  it('parses pipe-delimited owner | title | due rows with source attribution', () => {
    const out = [
      'Alice | Send the contract draft | 2025-04-01',
      'Bob | Review the SOC 2 report |',
    ].join('\n');
    const sources = [
      { id: 'm1', content: 'Alice can you send the contract draft' },
      { id: 'm2', content: 'Bob please review the SOC 2 report' },
    ];
    const tasks = parseKAppsExtractedTasks(out, sources);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      owner: 'Alice',
      title: 'Send the contract draft',
      dueDate: '2025-04-01',
      sourceMessageId: 'm1',
    });
    expect(tasks[1]).toMatchObject({
      owner: 'Bob',
      title: 'Review the SOC 2 report',
      sourceMessageId: 'm2',
    });
  });

  it('returns an empty list when the model refuses with INSUFFICIENT', () => {
    const out = 'INSUFFICIENT: thread does not name any owners or tasks';
    expect(parseKAppsExtractedTasks(out, [])).toEqual([]);
  });

  it('returns an empty list even when INSUFFICIENT is followed by extra explanation', () => {
    const out = [
      'INSUFFICIENT: cannot determine owners',
      'The thread is purely status updates without action items.',
    ].join('\n');
    expect(parseKAppsExtractedTasks(out, [])).toEqual([]);
  });
});

import { runPrefillForm, parseFormFields } from './tasks.js';

describe('parseFormFields', () => {
  it('keeps only allow-listed fields', () => {
    const out = ['vendor: Acme', 'cost: $100', 'amount: $200'].join('\n');
    expect(parseFormFields(out, ['vendor', 'amount'])).toEqual({
      vendor: 'Acme',
      amount: '$200',
    });
  });

  it('returns {} when output indicates insufficient context', () => {
    expect(parseFormFields('I do not have enough information.', ['vendor'])).toEqual({});
  });

  it('strips bullet prefixes and quoted values', () => {
    const out = '- vendor: "Acme"\n* amount: 1';
    expect(parseFormFields(out, ['vendor', 'amount'])).toEqual({
      vendor: 'Acme',
      amount: '1',
    });
  });
});

describe('runPrefillForm', () => {
  it('fills the requested fields and reports on-device metadata', async () => {
    const router = makeRouter();
    const resp = await runPrefillForm(router, {
      threadId: 't1',
      templateId: 'vendor_onboarding_v1',
      fields: ['vendor', 'amount', 'compliance', 'justification'],
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'We picked Acme at $42k SOC 2.' },
      ],
    });
    expect(resp.templateId).toBe('vendor_onboarding_v1');
    expect(resp.channelId).toBe('c1');
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
    expect(resp.fields.vendor).toBe('Acme Logs');
    expect(resp.fields.amount).toBe('$42,000');
    expect(resp.fields.compliance).toBe('SOC 2');
    expect(resp.sourceMessageIds.length).toBeGreaterThan(0);
  });

  it('throws when the thread has no messages', async () => {
    const router = makeRouter();
    await expect(
      runPrefillForm(router, {
        threadId: 't',
        templateId: 'x',
        fields: ['a'],
        messages: [],
      }),
    ).rejects.toThrow(/thread/);
  });
});

describe('parseBatchTranslations', () => {
  it('parses a numbered list into N entries', () => {
    const out = '1. Hi Alice, are you free for phở tomorrow?\n2. Yes, 7pm at that place.';
    expect(parseBatchTranslations(out, 2)).toEqual([
      'Hi Alice, are you free for phở tomorrow?',
      'Yes, 7pm at that place.',
    ]);
  });

  it('returns empty strings for missing indices', () => {
    const out = '1. first\n3. third';
    expect(parseBatchTranslations(out, 3)).toEqual(['first', '', 'third']);
  });

  it('ignores stray commentary lines', () => {
    const out = [
      'Here are the translations:',
      '1. first',
      'blah',
      '2. second',
    ].join('\n');
    expect(parseBatchTranslations(out, 2)).toEqual(['first', 'second']);
  });
});

describe('runTranslateBatch', () => {
  it('produces one TranslateResponse per input item', async () => {
    const router = makeRouter();
    const resp = await runTranslateBatch(router, {
      items: [
        { messageId: 'a', channelId: 'c', text: 'Hola', targetLanguage: 'en' },
        { messageId: 'b', channelId: 'c', text: 'Gracias', targetLanguage: 'en' },
      ],
    });
    expect(resp.results).toHaveLength(2);
    expect(resp.results[0]?.messageId).toBe('a');
    expect(resp.results[1]?.messageId).toBe('b');
    expect(resp.results[0]?.computeLocation).toBe('on_device');
    expect(resp.results[0]?.dataEgressBytes).toBe(0);
  });

  it('handles empty input', async () => {
    const router = makeRouter();
    const resp = await runTranslateBatch(router, { items: [] });
    expect(resp.results).toEqual([]);
  });
});
