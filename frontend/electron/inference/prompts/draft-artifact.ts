// Artifact-drafting prompt — produces a Markdown draft of a PRD /
// RFC / Proposal / SOP / QBR from a thread. The renderer streams
// the draft over `ai:stream`, so this prompt does not need a
// parser — it just shapes the model's output.

import { formatThread, type ThreadMessage } from './shared.js';

export type ArtifactKind = 'PRD' | 'RFC' | 'Proposal' | 'SOP' | 'QBR';
export type ArtifactSection = 'goal' | 'requirements' | 'risks' | 'all';

export interface DraftArtifactInput {
  messages: ThreadMessage[];
  artifactType: ArtifactKind;
  section?: ArtifactSection;
}

export const ARTIFACT_TYPE_HINT: Record<ArtifactKind, string> = {
  PRD:
    'a product requirements document with sections: Goal, Background, ' +
    'Requirements, Success Metrics, Risks, Open Questions',
  RFC:
    'a request for comments with sections: Context, Proposal, Alternatives ' +
    'Considered, Trade-offs, Decision Required',
  Proposal:
    'a vendor / project proposal with sections: Overview, Scope, Pricing, ' +
    'Risks, Recommended Decision',
  SOP:
    'a standard operating procedure with sections: Purpose, Scope, ' +
    'Procedure (numbered steps), Owners, Review cadence',
  QBR:
    'a quarterly business review with sections: Highlights, Misses, ' +
    'Customer signal, Plan for next quarter',
};

export const ARTIFACT_SECTION_HINT: Record<ArtifactSection, string> = {
  goal: 'Focus on the Goal / Background section only.',
  requirements: 'Focus on the Requirements / Procedure section only.',
  risks: 'Focus on the Risks / Open Questions section only.',
  all: 'Produce every section listed above.',
};

export function buildDraftArtifactPrompt(input: DraftArtifactInput): string {
  const section = input.section ?? 'all';
  const typeHint = ARTIFACT_TYPE_HINT[input.artifactType];
  const sectionHint = ARTIFACT_SECTION_HINT[section];
  const { rendered } = formatThread(input.messages);
  return [
    `You are drafting a ${input.artifactType} — ${typeHint}.`,
    sectionHint,
    'Use Markdown headings (## Section) for each section.',
    'Keep prose tight: short paragraphs or bulleted lists; no filler.',
    'Anchor every claim in the thread above — do not invent facts the',
    'thread does not state. Do not echo this prompt.',
    'Begin with the title line "# <artifact-type>: <short topic>".',
    '',
    'Thread:',
    rendered,
    '',
    'Draft:',
  ].join('\n');
}
