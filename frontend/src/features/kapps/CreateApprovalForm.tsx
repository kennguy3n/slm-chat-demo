import { type FormEvent, useEffect, useState } from 'react';
import { useKAppsStore } from '../../stores/kappsStore';
import { fetchUsers } from '../../api/chatApi';
import type { Approval } from '../../types/kapps';

interface Props {
  channelId: string;
  // Optional source thread the approval is being authored from. When the
  // user accepted an AI ApprovalPrefillCard, the thread the prefill was
  // built from is forwarded so the persisted approval back-links to it.
  sourceThreadId?: string;
  templateId?: string;
  initialTitle?: string;
  initialVendor?: string;
  initialAmount?: string;
  initialJustification?: string;
  initialRisk?: string;
  initialApprovers?: string[];
  // Pre-baked roster — when omitted CreateApprovalForm fetches /api/users.
  // Tests inject a fixed list to avoid a network call.
  approverOptions?: { id: string; name: string }[];
  aiGenerated?: boolean;
  onCreated?: (approval: Approval) => void;
  onCancel?: () => void;
}

// CreateApprovalForm — Phase 3 manual / accepted-AI approval submit
// flow. Powers both the ActionLauncher "Approve > Vendor / Budget /
// Access" paths and the "Accept" button on ApprovalPrefillCard.
export function CreateApprovalForm({
  channelId,
  sourceThreadId,
  templateId,
  initialTitle,
  initialVendor,
  initialAmount,
  initialJustification,
  initialRisk,
  initialApprovers,
  approverOptions,
  aiGenerated,
  onCreated,
  onCancel,
}: Props) {
  const createApproval = useKAppsStore((s) => s.createApproval);
  const [title, setTitle] = useState(initialTitle ?? '');
  const [vendor, setVendor] = useState(initialVendor ?? '');
  const [amount, setAmount] = useState(initialAmount ?? '');
  const [justification, setJustification] = useState(initialJustification ?? '');
  const [risk, setRisk] = useState(initialRisk ?? '');
  const [approvers, setApprovers] = useState<string[]>(initialApprovers ?? []);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>(
    approverOptions ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch user roster for the approver multi-select unless a static list
  // was injected by tests / parent.
  useEffect(() => {
    if (approverOptions) return;
    let cancelled = false;
    fetchUsers()
      .then((users) => {
        if (cancelled) return;
        setRoster(users.map((u) => ({ id: u.id, name: u.displayName ?? u.id })));
      })
      .catch(() => {
        // Roster fetch is non-blocking; the multi-select stays empty
        // and the user can type approver IDs in a freeform fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [approverOptions]);

  function toggleApprover(id: string) {
    setApprovers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Title is required');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      const approval = await createApproval({
        channelId,
        templateId,
        title: title.trim(),
        approvers,
        fields: {
          vendor: vendor.trim() || undefined,
          amount: amount.trim() || undefined,
          justification: justification.trim() || undefined,
          risk: risk.trim() || undefined,
        },
        sourceThreadId,
        aiGenerated: aiGenerated ?? false,
      });
      onCreated?.(approval);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="create-approval-form"
      onSubmit={handleSubmit}
      data-testid="create-approval-form"
      noValidate
    >
      <label className="create-approval-form__label">
        <span>Title</span>
        <input
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-required="true"
          data-testid="create-approval-title"
        />
      </label>
      <label className="create-approval-form__label">
        <span>Vendor</span>
        <input
          type="text"
          name="vendor"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          data-testid="create-approval-vendor"
        />
      </label>
      <label className="create-approval-form__label">
        <span>Amount</span>
        <input
          type="text"
          name="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          data-testid="create-approval-amount"
        />
      </label>
      <label className="create-approval-form__label">
        <span>Risk</span>
        <input
          type="text"
          name="risk"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          data-testid="create-approval-risk"
        />
      </label>
      <label className="create-approval-form__label">
        <span>Justification</span>
        <textarea
          name="justification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={3}
          data-testid="create-approval-justification"
        />
      </label>
      <fieldset className="create-approval-form__approvers">
        <legend>Approvers</legend>
        {roster.length === 0 && (
          <p className="create-approval-form__hint">No teammates loaded.</p>
        )}
        {roster.map((u) => (
          <label key={u.id} className="create-approval-form__checkbox">
            <input
              type="checkbox"
              checked={approvers.includes(u.id)}
              onChange={() => toggleApprover(u.id)}
              data-testid={`create-approval-approver-${u.id}`}
            />
            <span>{u.name}</span>
          </label>
        ))}
      </fieldset>
      {sourceThreadId && (
        <p className="create-approval-form__source" data-testid="create-approval-source">
          Source thread: <code>{sourceThreadId}</code>
        </p>
      )}
      {validationError && (
        <p className="create-approval-form__error" role="alert">
          {validationError}
        </p>
      )}
      <div className="create-approval-form__actions">
        <button
          type="submit"
          disabled={submitting}
          className="create-approval-form__submit"
          data-testid="create-approval-submit"
        >
          {submitting ? 'Submitting…' : 'Submit approval'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="create-approval-form__cancel"
            data-testid="create-approval-cancel"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
