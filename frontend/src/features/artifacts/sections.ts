// Section utilities shared between the ArtifactWorkspace renderer and
// any caller that needs to assign source-pin sectionIds matching the
// renderer's own slug format. Kept as plain TS (no JSX) so that
// importing from a component file doesn't break Fast Refresh.

export interface ParsedSection {
  id: string;
  heading: string;
  body: string;
  // Half-open [start, end) line range in the source body, useful for
  // mapping an excerpt back to the section it falls under.
  startLine: number;
  endLine: number;
}

// slugifyHeading converts "Goal" / "Goals & Risks" / "Goals  &  Risks"
// into "goal" / "goals_risks". Mirrors splitIntoSections's id format
// so external callers (e.g. ThreadPanel) can assign source-pin
// sectionIds that match the renderer's own ids.
export function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// splitIntoSections segments a markdown body by `# ...` headings. Each
// heading becomes a section whose `id` is `slugifyHeading(heading)`.
// Content before the first heading is bucketed under "preamble".
export function splitIntoSections(body: string): ParsedSection[] {
  if (!body.trim()) return [];
  const lines = body.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection = {
    id: 'preamble',
    heading: '',
    body: '',
    startLine: 0,
    endLine: 0,
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^#+\s+(.*)$/.exec(line);
    if (m) {
      if (current.heading || current.body.trim()) {
        current.endLine = i;
        sections.push(current);
      }
      const heading = m[1].trim();
      const id = slugifyHeading(heading);
      current = {
        id: id || heading,
        heading,
        body: '',
        startLine: i + 1,
        endLine: i + 1,
      };
    } else {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current.heading || current.body.trim()) {
    current.endLine = lines.length;
    sections.push(current);
  }
  return sections;
}

// findSectionIdForExcerpt searches `body` for a snippet of `excerpt`
// (case-insensitive, single-line, drops short tokens) and returns the
// id of the heading section that contains the first match. Falls back
// to the first section's id, then 'preamble'.
export function findSectionIdForExcerpt(
  body: string,
  excerpt: string,
  fallback = 'preamble',
): string {
  const sections = splitIntoSections(body);
  if (sections.length === 0) return fallback;
  const trimmed = (excerpt ?? '').trim().toLowerCase();
  if (!trimmed) return sections[0].id;

  // Try a longer phrase first; if that doesn't match, fall back to the
  // longest 4+-char token in the excerpt.
  const lowerBody = body.toLowerCase();
  let pos = lowerBody.indexOf(trimmed);
  if (pos < 0) {
    const tokens = trimmed
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
      .sort((a, b) => b.length - a.length);
    for (const t of tokens) {
      pos = lowerBody.indexOf(t);
      if (pos >= 0) break;
    }
  }
  if (pos < 0) return sections[0].id;

  // Translate `pos` to a line number, then pick the section whose
  // [startLine, endLine) contains it.
  const before = body.slice(0, pos);
  const line = before.split('\n').length - 1;
  for (const s of sections) {
    if (line >= s.startLine && line < s.endLine) return s.id;
  }
  return sections[0].id;
}
