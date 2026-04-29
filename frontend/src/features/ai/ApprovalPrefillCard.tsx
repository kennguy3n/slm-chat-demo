import { useEffect, useState } from 'react';
import type {
  PrefilledApprovalFields,
  PrefillApprovalResponse,
  PrivacyStripData,
  PrivacyStripWhyDetail,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';
import { CitationRenderer } from '../knowledge/CitationRenderer';
import type { CitationSource } from '../knowledge/CitationChip';

interface Props {
  prefill: PrefillApprovalResponse;
  // Allow callers to plug seeded message excerpts so the privacy strip
  // can show provenance. The keys are message ids from
  // prefill.sourceMessageIds.
  sourceExcerpts?: Record<string, string>;
  onAccept?: (fields: PrefilledApprovalFields) => void | Promise<void>;
  onEdit?: (fields: PrefilledApprovalFields) => void;
  onDiscard?: () => void;
}

const TEMPLATE_LABEL: Record<PrefillApprovalResponse['templateId'], string> = {
  vendor: 'Vendor',
  budget: 'Budget',
  access: 'Access',
};

const FIELD_LABEL: Record<keyof PrefilledApprovalFields, string> = {
  vendor: 'Vendor / subject',
  amount: 'Amount',
  justification: 'Justification',
  risk: 'Risk',
  extra: '',
};

// ApprovalPrefillCard renders the prefilled fields the inference router
// extracted from a B2B thread (PROPOSAL.md §5.4 "Approve"). The user
// reviews, edits inline, then clicks Accept to create the real Approval
// KApp card. PrivacyStrip below shows on-device / E4B / 0 bytes egress
// plus per-source provenance.
export function ApprovalPrefillCard({
  prefill,
  sourceExcerpts = {},
  onAccept,
  onEdit,
  onDiscard,
}: Props) {
  const [vendor, setVendor] = useState(prefill.fields.vendor ?? '');
  const [amount, setAmount] = useState(prefill.fields.amount ?? '');
  const [justification, setJustification] = useState(prefill.fields.justification ?? '');
  const [risk, setRisk] = useState(prefill.fields.risk ?? '');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Keep the fields in sync if a fresh prefill response arrives.
  useEffect(() => {
    setVendor(prefill.fields.vendor ?? '');
    setAmount(prefill.fields.amount ?? '');
    setJustification(prefill.fields.justification ?? '');
    setRisk(prefill.fields.risk ?? '');
    setAccepted(false);
    setSubmitting(false);
    setAcceptError(null);
  }, [prefill]);

  const merged: PrefilledApprovalFields = {
    vendor: vendor.trim() || undefined,
    amount: amount.trim() || undefined,
    justification: justification.trim() || undefined,
    risk: risk.trim() || undefined,
    extra: prefill.fields.extra,
  };

  const missing: string[] = [];
  if (!merged.vendor) missing.push('vendor');
  if (!merged.amount) missing.push('amount');
  if (!merged.justification) missing.push('justification');
  if (!merged.risk) missing.push('risk');

  const whyDetails: PrivacyStripWhyDetail[] = [];
  if (merged.vendor)
    whyDetails.push({ signal: `Vendor mentioned: "${merged.vendor}"` });
  if (merged.amount)
    whyDetails.push({ signal: `Amount mentioned: ${merged.amount}` });
  if (merged.risk)
    whyDetails.push({ signal: `Risk level mentioned: ${merged.risk}` });
  if (merged.justification)
    whyDetails.push({ signal: 'Justification reasoning extracted from thread' });
  for (const id of prefill.sourceMessageIds) {
    whyDetails.push({
      signal: 'Source message',
      sourceId: id,
      sourceLabel: sourceExcerpts[id] ?? id,
    });
  }

  const privacy: PrivacyStripData = {
    computeLocation: prefill.computeLocation,
    modelName: prefill.model,
    sources:
      prefill.sourceMessageIds.length > 0
        ? prefill.sourceMessageIds.map((id) => ({
            kind: 'message' as const,
            id,
            label: sourceExcerpts[id] ?? `Source message ${id}`,
          }))
        : [{ kind: 'thread' as const, id: prefill.threadId, label: 'Source thread' }],
    dataEgressBytes: prefill.dataEgressBytes,
    confidence: missing.length === 0 ? 0.88 : 0.7,
    missingInfo: missing.length > 0 ? missing : undefined,
    whySuggested: prefill.reason,
    whyDetails,
    origin: {
      kind: 'thread',
      id: prefill.threadId,
      label: 'Source thread',
    },
  };

  async function accept() {
    if (submitting || accepted) return;
    setAcceptError(null);
    setSubmitting(true);
    try {
      await onAccept?.(merged);
      setAccepted(true);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function edit() {
    onEdit?.(merged);
  }

  function discard() {
    onDiscard?.();
  }

  return (
    <article
      className="approval-prefill-card"
      data-testid="approval-prefill-card"
      aria-label="Prefilled approval"
    >
      <header className="approval-prefill-card__header">
        <span className="approval-prefill-card__kind">
          {TEMPLATE_LABEL[prefill.templateId]} approval
        </span>
        <span className="approval-prefill-card__ai-badge">AI</span>
        <span
          className="approval-prefill-card__tier"
          data-testid="approval-prefill-tier"
        >
          {prefill.tier.toUpperCase()}
        </span>
      </header>
      <h4 className="approval-prefill-card__title" data-testid="approval-prefill-title">
        {prefill.title}
      </h4>
      <dl className="approval-prefill-card__fields">
        <Field
          name="vendor"
          label={FIELD_LABEL.vendor}
          value={vendor}
          onChange={setVendor}
          disabled={accepted || submitting}
        />
        <Field
          name="amount"
          label={FIELD_LABEL.amount}
          value={amount}
          onChange={setAmount}
          disabled={accepted || submitting}
        />
        <Field
          name="risk"
          label={FIELD_LABEL.risk}
          value={risk}
          onChange={setRisk}
          disabled={accepted || submitting}
        />
        <Field
          name="justification"
          label={FIELD_LABEL.justification}
          value={justification}
          onChange={setJustification}
          disabled={accepted || submitting}
          multiline
        />
      </dl>
      {missing.length > 0 && (
        <p className="approval-prefill-card__missing" data-testid="approval-prefill-missing">
          Missing: {missing.join(', ')}
        </p>
      )}
      {prefill.sourceMessageIds.length > 0 && (
        <CitationRenderer
          text={justification}
          sources={prefill.sourceMessageIds.map<CitationSource>((id) => ({
            kind: 'message',
            id,
            label: sourceExcerpts[id] ?? `Source message ${id}`,
            excerpt: sourceExcerpts[id],
          }))}
          footerLabel={`Sources (${prefill.sourceMessageIds.length})`}
        />
      )}
      <div
        className="approval-prefill-card__actions"
        role="group"
        aria-label="Approval prefill actions"
      >
        <button
          type="button"
          onClick={accept}
          disabled={accepted || submitting}
          data-testid="approval-prefill-accept"
        >
          {accepted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit for approval'}
        </button>
        <button
          type="button"
          onClick={edit}
          disabled={accepted || submitting}
          data-testid="approval-prefill-edit"
        >
          Save edits
        </button>
        <button
          type="button"
          onClick={discard}
          disabled={accepted || submitting}
          data-testid="approval-prefill-discard"
        >
          Discard
        </button>
      </div>
      {acceptError && (
        <p
          className="approval-prefill-card__error"
          role="alert"
          data-testid="approval-prefill-error"
        >
          {acceptError}
        </p>
      )}
      <PrivacyStrip data={privacy} />
    </article>
  );
}

interface FieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  multiline?: boolean;
}

function Field({ name, label, value, onChange, disabled, multiline }: FieldProps) {
  return (
    <div className={`approval-prefill-card__field approval-prefill-card__field--${name}`}>
      <dt>
        <label htmlFor={`approval-prefill-${name}`}>{label}</label>
      </dt>
      <dd>
        {multiline ? (
          <textarea
            id={`approval-prefill-${name}`}
            data-testid={`approval-prefill-${name}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        ) : (
          <input
            id={`approval-prefill-${name}`}
            data-testid={`approval-prefill-${name}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </dd>
    </div>
  );
}
