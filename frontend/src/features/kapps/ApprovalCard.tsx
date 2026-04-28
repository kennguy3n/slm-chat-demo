import { useState } from 'react';
import type { Approval, ApprovalDecision } from '../../types/kapps';

interface Props {
  approval: Approval;
  // Phase 3 — approve / reject / comment. The card hosts a confirmation
  // pane before invoking the callback so users do not accidentally
  // commit to a decision.
  onDecide?: (decision: ApprovalDecision, note?: string) => void;
  onOpenSource?: (id: string) => void;
  mode?: 'full' | 'compact';
}

const STATUS_LABEL: Record<Approval['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ApprovalCard renders an Approvals KApp card. Phase 3 adds explicit
// approve / reject buttons with a confirmation pane and an expanded
// timeline view of the immutable decision log
// (ARCHITECTURE.md §6.1 / PROPOSAL.md §6.2).
export function ApprovalCard({ approval, onDecide, onOpenSource, mode = 'full' }: Props) {
  const fields = approval.fields;
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [note, setNote] = useState('');
  const isPending = approval.status === 'pending';
  const compact = mode === 'compact';

  function commit() {
    if (!pending) return;
    onDecide?.(pending, note.trim() || undefined);
    setPending(null);
    setNote('');
  }

  return (
    <article
      className={`kapp-card kapp-card--approval kapp-card--approval-${approval.status} kapp-card--${mode}`}
      data-testid="approval-card"
      data-mode={mode}
      aria-label={`Approval: ${approval.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">Approval</span>
        {approval.aiGenerated && <span className="kapp-card__ai-badge">AI</span>}
        <span
          className={`kapp-card__status kapp-card__status--${approval.status}`}
          data-testid="approval-card-status"
        >
          {STATUS_LABEL[approval.status]}
        </span>
      </header>
      <h4 className="kapp-card__title">{approval.title}</h4>
      {!compact && (
        <dl className="kapp-card__meta">
          <div>
            <dt>Requester</dt>
            <dd>{approval.requester}</dd>
          </div>
          <div>
            <dt>Approvers</dt>
            <dd>{approval.approvers.length === 0 ? '—' : approval.approvers.join(', ')}</dd>
          </div>
          {fields.vendor && (
            <div>
              <dt>Vendor</dt>
              <dd>{fields.vendor}</dd>
            </div>
          )}
          {fields.amount && (
            <div>
              <dt>Amount</dt>
              <dd>{fields.amount}</dd>
            </div>
          )}
          {fields.risk && (
            <div>
              <dt>Risk</dt>
              <dd>{fields.risk}</dd>
            </div>
          )}
        </dl>
      )}
      {!compact && fields.justification && (
        <p className="kapp-card__justification">{fields.justification}</p>
      )}

      {!compact && isPending && onDecide && pending === null && (
        <div className="kapp-card__actions" role="group" aria-label="Approval actions">
          <button
            type="button"
            className="kapp-card__action kapp-card__action--approve"
            onClick={() => setPending('approve')}
            data-testid="approval-card-approve"
          >
            Approve
          </button>
          <button
            type="button"
            className="kapp-card__action kapp-card__action--reject"
            onClick={() => setPending('reject')}
            data-testid="approval-card-reject"
          >
            Reject
          </button>
          <button
            type="button"
            className="kapp-card__action kapp-card__action--comment"
            onClick={() => setPending('comment')}
            data-testid="approval-card-comment"
          >
            Comment
          </button>
        </div>
      )}

      {!compact && pending !== null && (
        <div
          className="kapp-card__confirm"
          role="group"
          aria-label={`Confirm ${pending}`}
          data-testid="approval-card-confirm"
        >
          <p>
            Confirm <strong>{pending}</strong> for {approval.title}?
          </p>
          <label>
            <span className="visually-hidden">Add a note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              rows={2}
              data-testid="approval-card-note"
            />
          </label>
          <div className="kapp-card__confirm-actions">
            <button
              type="button"
              onClick={commit}
              data-testid="approval-card-confirm-commit"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setNote('');
              }}
              data-testid="approval-card-confirm-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!compact && (
        <details className="kapp-card__decision-log" data-testid="approval-card-log">
          <summary>Decision log ({approval.decisionLog.length})</summary>
          {approval.decisionLog.length === 0 ? (
            <p className="kapp-card__empty">No decisions recorded yet.</p>
          ) : (
            <ol className="kapp-card__timeline">
              {approval.decisionLog.map((d, idx) => (
                <li key={idx}>
                  <time dateTime={d.at}>{formatTimestamp(d.at)}</time>
                  <span className="kapp-card__decision-actor">{d.actor}</span>
                  <span className={`kapp-card__decision kapp-card__decision--${d.decision}`}>
                    {d.decision}
                  </span>
                  {d.note ? <p className="kapp-card__decision-note">{d.note}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      {!compact && approval.sourceThreadId && (
        <button
          type="button"
          className="kapp-card__source"
          onClick={() => onOpenSource?.(approval.sourceThreadId!)}
        >
          View source thread
        </button>
      )}
    </article>
  );
}
