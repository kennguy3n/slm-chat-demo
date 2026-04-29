import { type FormEvent, useState } from 'react';
import type { Form, FormFieldDef } from '../../types/kapps';

interface Props {
  form: Form;
  // Template fields are surfaced separately because Form.fields only
  // contains the prefilled values — labels / required flags live on
  // the template (FormTemplate.fields).
  templateFields: FormFieldDef[];
  // The set of field names that the AI prefilled — rendered with a
  // visual highlight so the user can audit the AI's contribution
  // before submitting.
  aiPrefilledFieldNames?: string[];
  onSubmit?: (fields: Record<string, string>) => Promise<void> | void;
  onDiscard?: () => void;
  onEdit?: () => void;
  // Used by the privacy strip parent to back-link to the source thread.
  sourceThreadId?: string;
}

// FormCard — Phase 3 Forms intake KApp surface. Renders a labelled,
// editable form prefilled (in part) by the AI from a thread context;
// the user can edit each field and submit to persist.
export function FormCard({
  form,
  templateFields,
  aiPrefilledFieldNames,
  onSubmit,
  onDiscard,
  onEdit,
  sourceThreadId,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({ ...form.fields });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(form.status === 'submitted');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const aiSet = new Set(aiPrefilledFieldNames ?? []);

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitted) return;
    const missing = templateFields.filter(
      (f) => f.required && !(values[f.name] ?? '').trim(),
    );
    if (missing.length > 0) {
      setErrorMessage(`Required: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await onSubmit?.(values);
      setSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="kapp-card kapp-card--form form-card"
      onSubmit={handleSubmit}
      data-testid={`form-card-${form.id}`}
      noValidate
    >
      <header className="form-card__header">
        <h3 className="form-card__title">{form.title}</h3>
        {form.aiGenerated && (
          <span className="form-card__badge" data-testid="form-card-ai-badge">
            AI prefilled
          </span>
        )}
        <span className={`form-card__status form-card__status--${form.status}`}>
          {submitted ? 'submitted' : form.status}
        </span>
      </header>
      {sourceThreadId && (
        <p className="form-card__source" data-testid="form-card-source">
          Source thread: <code>{sourceThreadId}</code>
        </p>
      )}
      <div className="form-card__fields">
        {templateFields.map((field) => {
          const isAI = aiSet.has(field.name);
          return (
            <label
              key={field.name}
              className={`form-card__field${isAI ? ' form-card__field--ai' : ''}`}
              data-ai={isAI ? 'true' : undefined}
              data-testid={`form-card-field-${field.name}`}
            >
              <span className="form-card__label">
                {field.label}
                {field.required ? ' *' : ''}
                {isAI && (
                  <span className="form-card__ai-pip" aria-label="AI prefilled">
                    ✦
                  </span>
                )}
              </span>
              <input
                type="text"
                name={field.name}
                value={values[field.name] ?? ''}
                onChange={(e) => handleChange(field.name, e.target.value)}
                disabled={submitted}
                aria-required={field.required ? 'true' : undefined}
                data-testid={`form-card-input-${field.name}`}
              />
            </label>
          );
        })}
      </div>
      {errorMessage && (
        <p className="form-card__error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="form-card__actions">
        <button
          type="submit"
          disabled={submitting || submitted}
          className="form-card__submit"
          data-testid="form-card-submit"
        >
          {submitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit'}
        </button>
        {onEdit && !submitted && (
          <button
            type="button"
            onClick={onEdit}
            className="form-card__edit"
            data-testid="form-card-edit"
          >
            Edit
          </button>
        )}
        {onDiscard && !submitted && (
          <button
            type="button"
            onClick={onDiscard}
            className="form-card__discard"
            data-testid="form-card-discard"
          >
            Discard
          </button>
        )}
      </div>
    </form>
  );
}
