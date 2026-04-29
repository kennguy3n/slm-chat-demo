import { describe, expect, it } from 'vitest';
import {
  findSectionIdForExcerpt,
  slugifyHeading,
  splitIntoSections,
} from '../sections';

describe('slugifyHeading', () => {
  it('lowercases and collapses non-alphanumerics into underscores', () => {
    expect(slugifyHeading('Goal')).toBe('goal');
    expect(slugifyHeading('Goals & Risks')).toBe('goals_risks');
    expect(slugifyHeading('  Goals  &  Risks  ')).toBe('goals_risks');
  });
});

describe('splitIntoSections', () => {
  it('returns an empty array for blank bodies', () => {
    expect(splitIntoSections('')).toEqual([]);
    expect(splitIntoSections('   \n\n')).toEqual([]);
  });

  it('segments a markdown body into headed sections with line ranges', () => {
    const body = '# Goal\nKeep p99 latency low.\n\n# Risks\nVendor lock-in.';
    const secs = splitIntoSections(body);
    expect(secs.map((s) => s.id)).toEqual(['goal', 'risks']);
    expect(secs[0].body).toContain('Keep p99 latency low.');
    expect(secs[0].endLine).toBeGreaterThan(secs[0].startLine);
  });

  it('puts content before the first heading under "preamble"', () => {
    const body = 'Intro line.\n\n# Goal\nKeep p99 latency low.';
    const secs = splitIntoSections(body);
    expect(secs.map((s) => s.id)).toEqual(['preamble', 'goal']);
  });
});

describe('findSectionIdForExcerpt', () => {
  const body =
    '# Goal\nKeep p99 latency under 200ms.\n\n# Requirements\nMust support OAuth.\n\n# Risks\nVendor lock-in concerns.';

  it('returns the section id whose body contains the excerpt', () => {
    expect(findSectionIdForExcerpt(body, 'OAuth')).toBe('requirements');
    expect(findSectionIdForExcerpt(body, 'Vendor lock-in')).toBe('risks');
  });

  it('falls back to the longest 4+-char token when the full excerpt is absent', () => {
    expect(findSectionIdForExcerpt(body, 'oauth integration support')).toBe(
      'requirements',
    );
  });

  it('falls back to the first section id when no token matches', () => {
    expect(findSectionIdForExcerpt(body, 'completely unrelated phrase')).toBe('goal');
  });

  it('returns the supplied fallback when the body is empty', () => {
    expect(findSectionIdForExcerpt('', 'anything', 'preamble')).toBe('preamble');
  });
});
