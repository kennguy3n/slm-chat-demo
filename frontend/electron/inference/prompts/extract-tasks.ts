// KApps task-extraction prompt — pulls assignable action items out
// of a B2B work thread. The output is one task per line in
// `<owner> | <title> | <due-or-blank>` form so the parser can stay
// strict and the renderer can map each task back to a source
// message via fuzzy match in tasks.ts.

import {
  formatThread,
  isInsufficient,
  stripBulletPrefix,
  type ThreadMessage,
} from './shared.js';

export interface ExtractTasksInput {
  messages: ThreadMessage[];
}

export interface ExtractedTaskRow {
  owner: string;
  title: string;
  dueDate?: string;
}

export interface ExtractTasksOutput {
  tasks: ExtractedTaskRow[];
}

export function buildExtractTasksPrompt(input: ExtractTasksInput): string {
  const { rendered } = formatThread(input.messages);
  return [
    'You extract assignable action items from a work-chat thread.',
    'Output one task per line in the exact format:',
    '  <owner> | <title> | <due-date or blank>',
    'Owner is the person who agreed to do the work (a name or "@" handle).',
    'Title is one short imperative sentence (max 12 words).',
    'Due-date is "YYYY-MM-DD" or a short phrase ("Friday", "EOD",',
    '"end of week"); leave blank when the thread does not mention one.',
    'No numbers, no bullets, no commentary.',
    'If the thread has no assignable action items, reply with the',
    'single line: INSUFFICIENT: <reason>.',
    '',
    'Example:',
    'Alice | Lock vendor pricing | EOW',
    'Dave | Pull risk notes | ',
    '',
    'Thread:',
    rendered,
    '',
    'Tasks:',
  ].join('\n');
}

export function parseExtractTasksOutput(out: string): ExtractTasksOutput {
  if (isInsufficient(out)) return { tasks: [] };
  const tasks: ExtractedTaskRow[] = [];
  for (const raw of (out ?? '').split('\n')) {
    let line = stripBulletPrefix(raw);
    if (!line) continue;
    // Tolerate a leading "Tasks:" / "Action items:" header line.
    if (/^(tasks|action items|here are)\b/i.test(line)) continue;
    // Pipe-delimited: owner | title | due
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const owner = parts[0]!;
      const title = parts[1]!;
      const due = parts[2] ?? '';
      tasks.push({
        owner,
        title,
        ...(due ? { dueDate: due } : {}),
      });
      continue;
    }
    // Fallback: "<owner>: <title>" or "@owner please <title>" — best effort.
    const colon = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (colon) {
      tasks.push({ owner: colon[1]!.trim(), title: colon[2]!.trim() });
      continue;
    }
    const mention = line.match(/^@(\w+)[^\w]+(.+)$/);
    if (mention) {
      tasks.push({ owner: '@' + mention[1]!, title: mention[2]!.trim() });
      continue;
    }
  }
  return { tasks };
}
