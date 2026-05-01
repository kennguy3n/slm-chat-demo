// Phase 7 — prompt library unit tests. Each prompt module is tested
// for two things:
//
//   1. The build*Prompt helper produces a string that mentions the
//      input messages and the expected output schema, and stays
//      under the rough Bonsai-1.7B system-instruction budget
//      (≤ 2000 chars including the rendered thread).
//   2. The parseOutput helper recovers structured rows from the
//      slightly-noisier formats Bonsai-1.7B emits in practice — extra
//      whitespace, mixed bullet markers, occasional headers, single
//      missing fields, and the explicit `INSUFFICIENT:` refusal.

import { describe, it, expect } from 'vitest';
import {
  buildSummarizePrompt,
  parseSummarizeOutput,
  buildExtractTasksPrompt,
  parseExtractTasksOutput,
  buildPrefillApprovalPrompt,
  parsePrefillApprovalOutput,
  buildDraftArtifactPrompt,
  buildExtractKnowledgePrompt,
  parseExtractKnowledgeOutput,
} from '../index.js';

const THREAD = [
  { id: 'm1', channelId: 'c', senderId: 'alice', content: 'Need to lock vendor pricing for Q3.' },
  { id: 'm2', channelId: 'c', senderId: 'dave', content: 'Acme Logs $42k/yr; SOC 2 Type II.' },
  { id: 'm3', channelId: 'c', senderId: 'eve', content: 'Decision: go with Acme. Risk: medium.' },
];

describe('summarize prompt', () => {
  it('renders the messages and asks for 3-5 bullets', () => {
    const prompt = buildSummarizePrompt({ messages: THREAD });
    expect(prompt).toContain('alice: Need to lock vendor pricing for Q3.');
    expect(prompt).toContain('eve: Decision: go with Acme.');
    expect(prompt).toMatch(/3-5 short bullets/i);
    expect(prompt).toMatch(/INSUFFICIENT/);
    // Stay well under the 2048-token Bonsai window.
    expect(prompt.length).toBeLessThan(2000);
  });

  it('parses canonical bullet output', () => {
    const out = [
      '- Decision: go with Acme Logs at $42k/yr.',
      '- Risk: medium — single-region.',
      '- Owner: eve.',
    ].join('\n');
    expect(parseSummarizeOutput(out).bullets).toHaveLength(3);
  });

  it('tolerates extra whitespace, alternative bullet markers, and stray header', () => {
    const out = [
      'Summary:',
      '   * Decision: go with Acme Logs at $42k/yr.   ',
      '',
      '• Risk: medium — single-region.',
      '1. Owner: eve.',
    ].join('\n');
    const bullets = parseSummarizeOutput(out).bullets;
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toMatch(/Acme Logs/);
  });

  it('returns no bullets on the INSUFFICIENT refusal contract', () => {
    expect(
      parseSummarizeOutput('INSUFFICIENT: thread is empty.').bullets,
    ).toEqual([]);
  });
});

describe('extract-tasks prompt', () => {
  it('asks for owner | title | due output', () => {
    const prompt = buildExtractTasksPrompt({ messages: THREAD });
    expect(prompt).toContain('<owner> | <title> | <due-date or blank>');
    expect(prompt).toContain('alice: Need to lock vendor pricing for Q3.');
  });

  it('parses canonical pipe-delimited rows', () => {
    const out = [
      'Alice | Lock vendor pricing | EOW',
      'Dave | Pull risk notes | ',
    ].join('\n');
    const { tasks } = parseExtractTasksOutput(out);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      owner: 'Alice',
      title: 'Lock vendor pricing',
      dueDate: 'EOW',
    });
    expect(tasks[1]).toEqual({ owner: 'Dave', title: 'Pull risk notes' });
  });

  it('skips a leading "Tasks:" header and tolerates bullet markers', () => {
    const out = [
      'Tasks:',
      '- Alice | Lock vendor pricing | EOW',
      '* Dave | Pull risk notes | Friday',
    ].join('\n');
    expect(parseExtractTasksOutput(out).tasks).toHaveLength(2);
  });

  it('falls back to "owner: title" prose lines', () => {
    const out = ['Alice: lock vendor pricing', 'Dave: pull risk notes'].join('\n');
    const { tasks } = parseExtractTasksOutput(out);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.owner).toBe('Alice');
  });

  it('returns no tasks on the INSUFFICIENT refusal contract', () => {
    expect(parseExtractTasksOutput('INSUFFICIENT: nothing actionable').tasks).toEqual([]);
  });
});

describe('prefill-approval prompt', () => {
  it('renders the four canonical field labels', () => {
    const prompt = buildPrefillApprovalPrompt({ messages: THREAD, templateId: 'vendor' });
    expect(prompt).toContain('vendor:');
    expect(prompt).toContain('amount:');
    expect(prompt).toContain('justification:');
    expect(prompt).toContain('risk:');
    expect(prompt).toContain('vendor');
  });

  it('parses canonical four-line output', () => {
    const out = [
      'vendor: Acme Logs',
      'amount: $42,000 / yr',
      'justification: Lowest-cost SOC 2-cleared bidder.',
      'risk: medium',
    ].join('\n');
    expect(parsePrefillApprovalOutput(out).fields).toEqual({
      vendor: 'Acme Logs',
      amount: '$42,000 / yr',
      justification: 'Lowest-cost SOC 2-cleared bidder.',
      risk: 'medium',
    });
  });

  it('maps cost / price aliases to amount', () => {
    const out = [
      'vendor: Acme',
      'cost: $42k/yr',
    ].join('\n');
    expect(parsePrefillApprovalOutput(out).fields.amount).toBe('$42k/yr');
  });

  it('maps `why` / `reason` / `rationale` aliases onto justification', () => {
    const out = [
      'vendor: Acme Logs',
      'why: Cheapest SOC 2-cleared bidder',
    ].join('\n');
    const { fields } = parsePrefillApprovalOutput(out);
    expect(fields.justification).toBe('Cheapest SOC 2-cleared bidder');
    // `why` should resolve cleanly — never leak into extra.
    expect(fields.extra).toBeUndefined();
  });

  it('strips quoted values and `[MOCK]` prefix from each line', () => {
    const out = [
      '[MOCK] vendor: "Acme Logs"',
      '[MOCK] amount: \'$42,000\'',
      'risk: low',
    ].join('\n');
    const { fields } = parsePrefillApprovalOutput(out);
    expect(fields.vendor).toBe('Acme Logs');
    expect(fields.amount).toBe('$42,000');
    expect(fields.risk).toBe('low');
  });

  it('captures unknown keys in extra rather than silently dropping them', () => {
    const out = [
      'vendor: Acme Logs',
      'contract length: 12 months',
      'termination: 30 days',
    ].join('\n');
    const { fields } = parsePrefillApprovalOutput(out);
    expect(fields.vendor).toBe('Acme Logs');
    expect(fields.extra).toEqual({
      'contract length': '12 months',
      termination: '30 days',
    });
  });

  it('honours INSUFFICIENT', () => {
    expect(parsePrefillApprovalOutput('INSUFFICIENT: not a vendor thread').fields).toEqual({});
  });
});

describe('draft-artifact prompt', () => {
  it('includes the artifact type, section hint, and thread', () => {
    const prompt = buildDraftArtifactPrompt({
      messages: THREAD,
      artifactType: 'PRD',
      section: 'requirements',
    });
    expect(prompt).toContain('PRD');
    expect(prompt).toContain('product requirements document');
    expect(prompt).toContain('Requirements / Procedure');
    expect(prompt).toContain('alice: Need to lock vendor pricing for Q3.');
  });
});

describe('extract-knowledge prompt', () => {
  it('asks for kind | description | actor | due rows', () => {
    const prompt = buildExtractKnowledgePrompt({ messages: THREAD });
    expect(prompt).toContain('<kind> | <description> | <actor-or-blank> | <due-or-blank>');
    expect(prompt).toContain('decision, owner, risk, requirement, deadline');
  });

  it('parses canonical four-pipe output', () => {
    const out = [
      'decision | Go with Acme Logs at $42k/yr | eve | ',
      'risk | Single-region (us-east-1) | | ',
      'deadline | Decision needed | dave | next Tuesday',
    ].join('\n');
    const { rows } = parseExtractKnowledgeOutput(out);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      kind: 'decision',
      description: 'Go with Acme Logs at $42k/yr',
      actor: 'eve',
    });
    expect(rows[2]).toEqual({
      kind: 'deadline',
      description: 'Decision needed',
      actor: 'dave',
      dueDate: 'next Tuesday',
    });
  });

  it('maps singular / plural / synonym kinds', () => {
    const out = [
      'decisions | x | | ',
      'owner | y | a | ',
      'risks | z | | ',
      'requirements | w | | ',
      'spec | s | | ',
      'unknown | nope | | ',
    ].join('\n');
    const kinds = parseExtractKnowledgeOutput(out).rows.map((r) => r.kind);
    expect(kinds).toEqual(['decision', 'owner', 'risk', 'requirement', 'requirement']);
  });

  it('honours INSUFFICIENT', () => {
    expect(parseExtractKnowledgeOutput('INSUFFICIENT: empty channel').rows).toEqual([]);
  });
});
