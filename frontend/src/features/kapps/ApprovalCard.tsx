import type { Approval } from '../../types/kapps';

interface Props {
  approval: Approval;
  onOpenSource?: (id: string) => void;
}

const STATUS_LABEL: Record<Approval['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ApprovalCard renders an Approvals KApp card with the immutable decision
// log. It surfaces requester / approvers / vendor-amount-justification-risk
// fields and the source thread back-link (ARCHITECTURE.md 6.1).
export function ApprovalCard({ approval, onOpenSource }: Props) {
  const fields = approval.fields;
  return (
    <article
      className={`kapp-card kapp-card--approval kapp-card--approval-${approval.status}`}
      data-testid="approval-card"
      aria-label={`Approval: ${approval.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">Approval</span>
        {approval.aiGenerated && <span className="kapp-card__ai-badge">AI</span>}
        <span className={`kapp-card__status kapp-card__status--${approval.status}`}>
          {STATUS_LABEL[approval.status]}
        </span>
      </header>
      <h4 className="kapp-card__title">{approval.title}</h4>
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
      {fields.justification && (
        <p className="kapp-card__justification">{fields.justification}</p>
      )}
      <details className="kapp-card__decision-log">
        <summary>Decision log ({approval.decisionLog.length})</summary>
        {approval.decisionLog.length === 0 ? (
          <p className="kapp-card__empty">No decisions recorded yet.</p>
        ) : (
          <ol>
            {approval.decisionLog.map((d, idx) => (
              <li key={idx}>
                <span className="kapp-card__decision-actor">{d.actor}</span>{' '}
                {d.decision}
                {d.note ? ` — ${d.note}` : ''}
              </li>
            ))}
          </ol>
        )}
      </details>
      {approval.sourceThreadId && (
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
