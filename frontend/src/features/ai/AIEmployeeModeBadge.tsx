// Phase 4 — small mode pill rendered next to AI-generated outputs so
// humans immediately see whether an AI Employee ran a step on their
// behalf ('auto') or only suggested something inline ('inline'). The
// distinction matters because it changes the audit trail: auto runs
// are logged without user confirmation, inline suggestions require
// user acceptance.

import type { AIEmployeeMode } from '../../types/aiEmployee';

interface Props {
  mode: AIEmployeeMode;
  employeeName: string;
  // size controls the visual scale. 'sm' is used inline in message
  // bubbles and sidebar rows; 'md' is used in KApp card headers.
  size?: 'sm' | 'md';
  className?: string;
}

const LABEL_BY_MODE: Record<AIEmployeeMode, string> = {
  auto: 'Auto',
  inline: 'Inline',
};

const ICON_BY_MODE: Record<AIEmployeeMode, string> = {
  // Unicode icons — the demo avoids bundling an icon library, and
  // screen readers announce the text label, so a codepoint is fine
  // here. "⚡" = auto (agent took action), "👤" = inline (human still
  // in the loop).
  auto: '⚡',
  inline: '👤',
};

// AIEmployeeModeBadge renders the pill. The component is a pure
// presentational helper; callers pass in the AI Employee's current
// mode + display name and we render a small coloured chip.
export function AIEmployeeModeBadge({
  mode,
  employeeName,
  size = 'sm',
  className,
}: Props) {
  const classes = [
    'ai-employee-mode-badge',
    `ai-employee-mode-badge--${mode}`,
    `ai-employee-mode-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={classes}
      data-testid="ai-employee-mode-badge"
      data-mode={mode}
      aria-label={`${LABEL_BY_MODE[mode]} mode · ${employeeName}`}
    >
      <span
        className="ai-employee-mode-badge__variant"
        data-testid={`ai-employee-mode-badge-${mode}`}
      >
        <span aria-hidden="true" className="ai-employee-mode-badge__icon">
          {ICON_BY_MODE[mode]}
        </span>
        <span className="ai-employee-mode-badge__label">
          {LABEL_BY_MODE[mode]} · {employeeName}
        </span>
      </span>
    </span>
  );
}
