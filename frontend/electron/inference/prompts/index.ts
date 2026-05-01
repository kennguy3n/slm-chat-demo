// Bonsai-1.7B prompt library — Phase 7 (model-swap + B2C redesign).
//
// Every B2B AI surface that needs a model call routes through one of
// the modules in this directory. Each module exports two pure
// functions:
//
//   buildPrompt(input)  → string         (the prompt envelope)
//   parseOutput(output) → structured     (the parsed result)
//
// Keeping the prompt construction and the output parser in the same
// file makes it cheap to iterate on the prompt for the 1.7B model
// class without chasing the parser through tasks.ts.
//
// Constraints honoured by every prompt:
//
//   • System / instruction span ≤ 150 tokens (≈ 600 characters) so
//     the 1024-token context window has room for input + output.
//   • Explicit, single-line output format ("<field>: <value>" or
//     "<owner> | <title> | <due>") so the parsers can recover from
//     the slightly-noisier output Bonsai-1.7B produces vs. a larger
//     model.
//   • Caller-provided message content is truncated to a budget that
//     leaves room for the system instruction + a generation window.
//   • Refusal contract: the model is told to emit
//     `INSUFFICIENT: <reason>` when the thread genuinely lacks the
//     requested fields. Parsers detect this and return an empty
//     result rather than hallucinating.

export {
  buildSummarizePrompt,
  parseSummarizeOutput,
  type SummarizeInput,
  type SummarizeOutput,
} from './summarize.js';
export {
  buildExtractTasksPrompt,
  parseExtractTasksOutput,
  type ExtractTasksInput,
  type ExtractTasksOutput,
  type ExtractedTaskRow,
} from './extract-tasks.js';
export {
  buildPrefillApprovalPrompt,
  parsePrefillApprovalOutput,
  type PrefillApprovalInput,
  type PrefillApprovalOutput,
  type PrefilledFields,
} from './prefill-approval.js';
export {
  buildDraftArtifactPrompt,
  type DraftArtifactInput,
  ARTIFACT_TYPE_HINT,
  ARTIFACT_SECTION_HINT,
} from './draft-artifact.js';
export {
  buildExtractKnowledgePrompt,
  parseExtractKnowledgeOutput,
  type ExtractKnowledgeInput,
  type ExtractKnowledgeOutput,
  type KnowledgeRow,
  type KnowledgeKind,
} from './extract-knowledge.js';
export {
  buildConversationInsightsPrompt,
  parseConversationInsightsOutput,
  type ConversationInsightsInput,
  type ConversationInsightsOutput,
  type ConversationInsightTopicRow,
  type ConversationInsightActionRow,
  type ConversationInsightDecisionRow,
  type ConversationSentiment,
} from './conversation-insights.js';

// Shared utilities that several prompt modules use.
export { truncateRunes, formatThread, INSUFFICIENT_PREFIX, isInsufficient } from './shared.js';
