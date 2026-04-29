import { useEffect, useMemo, useState } from 'react';
import {
  fetchWorkspacePolicy,
  updateWorkspacePolicy,
} from '../../api/policyApi';
import {
  POLICY_TASK_TYPES,
  type PolicyTaskType,
  type WorkspacePolicy,
  type WorkspacePolicyPatch,
} from '../../types/policy';

interface Props {
  workspaceId: string;
  // Optional injected fetchers (tests / Storybook).
  injectedFetch?: typeof fetchWorkspacePolicy;
  injectedUpdate?: typeof updateWorkspacePolicy;
  initialPolicy?: WorkspacePolicy;
}

interface FormState {
  allowServerCompute: boolean;
  requireRedaction: boolean;
  maxEgressBytesPerDay: number;
  allowed: Set<PolicyTaskType>;
  denied: Set<PolicyTaskType>;
}

function toFormState(p: WorkspacePolicy): FormState {
  return {
    allowServerCompute: p.allowServerCompute,
    requireRedaction: p.requireRedaction,
    maxEgressBytesPerDay: p.maxEgressBytesPerDay,
    allowed: new Set((p.serverAllowedTasks ?? []) as PolicyTaskType[]),
    denied: new Set((p.serverDeniedTasks ?? []) as PolicyTaskType[]),
  };
}

function fromFormState(s: FormState): WorkspacePolicyPatch {
  return {
    allowServerCompute: s.allowServerCompute,
    requireRedaction: s.requireRedaction,
    maxEgressBytesPerDay: s.maxEgressBytesPerDay,
    serverAllowedTasks: Array.from(s.allowed),
    serverDeniedTasks: Array.from(s.denied),
  };
}

// PolicyAdminPanel renders the per-workspace AI policy controls
// (Phase 6 §5). Mounted in the B2B right-rail's "Policy" tab.
export function PolicyAdminPanel({
  workspaceId,
  injectedFetch,
  injectedUpdate,
  initialPolicy,
}: Props) {
  const fetcher = injectedFetch ?? fetchWorkspacePolicy;
  const updater = injectedUpdate ?? updateWorkspacePolicy;

  const [policy, setPolicy] = useState<WorkspacePolicy | null>(initialPolicy ?? null);
  const [form, setForm] = useState<FormState | null>(
    initialPolicy ? toFormState(initialPolicy) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (initialPolicy) return;
    // Clear any stale loadError from a previous workspace so a
    // successful fetch doesn't get hidden by the early-return error
    // screen below.
    setLoadError(null);
    let cancelled = false;
    fetcher(workspaceId)
      .then((p) => {
        if (cancelled) return;
        setPolicy(p);
        setForm(toFormState(p));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fetcher, initialPolicy]);

  const dirty = useMemo(() => {
    if (!policy || !form) return false;
    const normalize = (s: FormState) => ({
      allowServerCompute: s.allowServerCompute,
      requireRedaction: s.requireRedaction,
      maxEgressBytesPerDay: s.maxEgressBytesPerDay,
      allowed: Array.from(s.allowed).sort(),
      denied: Array.from(s.denied).sort(),
    });
    const a = JSON.stringify(normalize(toFormState(policy)));
    const b = JSON.stringify(normalize(form));
    return a !== b;
  }, [policy, form]);

  if (loadError) {
    return (
      <div className="policy-admin-panel" data-testid="policy-admin-panel">
        <p className="policy-admin-panel__error" role="alert">
          Failed to load policy: {loadError}
        </p>
      </div>
    );
  }
  if (!form || !policy) {
    return (
      <div className="policy-admin-panel" data-testid="policy-admin-panel">
        <p className="policy-admin-panel__loading">Loading policy…</p>
      </div>
    );
  }

  function toggleAllowed(task: PolicyTaskType) {
    setForm((s) => {
      if (!s) return s;
      const next = new Set(s.allowed);
      if (next.has(task)) next.delete(task);
      else next.add(task);
      return { ...s, allowed: next };
    });
  }

  function toggleDenied(task: PolicyTaskType) {
    setForm((s) => {
      if (!s) return s;
      const next = new Set(s.denied);
      if (next.has(task)) next.delete(task);
      else next.add(task);
      return { ...s, denied: next };
    });
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updater(workspaceId, fromFormState(form));
      setPolicy(updated);
      setForm(toFormState(updated));
      setSavedAt(new Date().toISOString());
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="policy-admin-panel" data-testid="policy-admin-panel">
      <header className="policy-admin-panel__header">
        <h4>AI compute policy</h4>
        <p className="policy-admin-panel__hint">
          Controls which AI tasks may dispatch to the confidential server tier.
        </p>
      </header>

      <fieldset className="policy-admin-panel__group">
        <label data-testid="policy-allow-server">
          <input
            type="checkbox"
            checked={form.allowServerCompute}
            onChange={(e) => setForm({ ...form, allowServerCompute: e.target.checked })}
          />
          Allow confidential-server compute
        </label>
        <label data-testid="policy-require-redaction">
          <input
            type="checkbox"
            checked={form.requireRedaction}
            onChange={(e) => setForm({ ...form, requireRedaction: e.target.checked })}
          />
          Require redaction for server-bound tasks
        </label>
        <label className="policy-admin-panel__bytes">
          Max daily egress (bytes)
          <input
            type="number"
            min={0}
            value={form.maxEgressBytesPerDay}
            onChange={(e) =>
              setForm({
                ...form,
                maxEgressBytesPerDay: Number.isFinite(Number(e.target.value))
                  ? Number(e.target.value)
                  : 0,
              })
            }
            data-testid="policy-max-egress"
          />
        </label>
      </fieldset>

      <fieldset className="policy-admin-panel__group">
        <legend>Server-allowed tasks</legend>
        {POLICY_TASK_TYPES.map((t) => (
          <label key={`allow-${t}`} data-testid={`policy-allowed-${t}`}>
            <input
              type="checkbox"
              checked={form.allowed.has(t)}
              onChange={() => toggleAllowed(t)}
            />
            {t}
          </label>
        ))}
      </fieldset>

      <fieldset className="policy-admin-panel__group">
        <legend>Server-denied tasks (overrides allow list)</legend>
        {POLICY_TASK_TYPES.map((t) => (
          <label key={`deny-${t}`} data-testid={`policy-denied-${t}`}>
            <input
              type="checkbox"
              checked={form.denied.has(t)}
              onChange={() => toggleDenied(t)}
            />
            {t}
          </label>
        ))}
      </fieldset>

      <footer className="policy-admin-panel__footer">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          data-testid="policy-save"
        >
          {saving ? 'Saving…' : 'Save policy'}
        </button>
        {savedAt && !saveError && (
          <span className="policy-admin-panel__saved" data-testid="policy-saved">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        {saveError && (
          <span
            className="policy-admin-panel__save-error"
            role="alert"
            data-testid="policy-save-error"
          >
            Failed to save: {saveError}
          </span>
        )}
      </footer>
    </div>
  );
}
