import type {
  GuardrailRewriteResult,
  SkillPrivacy,
  SkillSource,
} from '../../types/electron';
import type { PrivacyStripSource } from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  original: string;
  result: GuardrailRewriteResult;
  privacy: SkillPrivacy;
  onAccept: (rewrite: string) => void;
  onKeep: () => void;
  onEdit: () => void;
}

// GuardrailRewriteCard renders inline below the Composer when the
// guardrail-rewrite skill detects PII / aggressive tone / unverified
// claims in the outgoing text. The user can accept the suggested
// rewrite, keep the original, or jump back into editing. The privacy
// strip confirms the review ran on-device with zero egress.
export function GuardrailRewriteCard({
  original,
  result,
  privacy,
  onAccept,
  onKeep,
  onEdit,
}: Props) {
  if (result.safe) return null;
  return (
    <section
      className="guardrail-rewrite-card"
      role="alertdialog"
      aria-label="Outgoing message review"
      data-testid="guardrail-rewrite-card"
    >
      <header className="guardrail-rewrite-card__header">
        <h3 className="guardrail-rewrite-card__title">Heads up before you send</h3>
        <p className="guardrail-rewrite-card__subtitle">{result.rationale}</p>
      </header>

      <div className="guardrail-rewrite-card__diff">
        <div className="guardrail-rewrite-card__column">
          <h4>Original</h4>
          <p data-testid="guardrail-rewrite-original">{original}</p>
        </div>
        <div className="guardrail-rewrite-card__column">
          <h4>Suggested rewrite</h4>
          <p data-testid="guardrail-rewrite-suggestion">{result.rewrite ?? original}</p>
        </div>
      </div>

      {result.findings.length > 0 && (
        <ul className="guardrail-rewrite-card__findings" data-testid="guardrail-rewrite-findings">
          {result.findings.map((f, i) => (
            <li key={`${i}-${f.excerpt}`} className="guardrail-rewrite-card__finding">
              <span
                className={`guardrail-rewrite-card__category guardrail-rewrite-card__category--${f.category}`}
              >
                {f.category}
              </span>
              <span className="guardrail-rewrite-card__excerpt">{f.excerpt}</span>
              <span className="guardrail-rewrite-card__reason">{f.reason}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="guardrail-rewrite-card__actions">
        <button
          type="button"
          onClick={() => onAccept(result.rewrite ?? original)}
          data-testid="guardrail-rewrite-accept"
        >
          Use rewrite
        </button>
        <button type="button" onClick={onKeep} data-testid="guardrail-rewrite-keep">
          Keep original
        </button>
        <button type="button" onClick={onEdit} data-testid="guardrail-rewrite-edit">
          Edit
        </button>
      </div>

      <PrivacyStrip
        data={{
          computeLocation: privacy.computeLocation,
          modelName: privacy.modelName,
          sources: privacy.sources.map(toPrivacySource),
          dataEgressBytes: privacy.dataEgressBytes,
          whySuggested: privacy.reason,
          whyDetails: [
            { signal: `Routed to ${privacy.tier.toUpperCase()}` },
            { signal: `${result.findings.length} risk(s) flagged` },
            { signal: 'Reviewed on-device only' },
          ],
          origin: {
            kind: 'message',
            id: 'composer',
            label: 'Outgoing message',
          },
        }}
      />
    </section>
  );
}

function toPrivacySource(s: SkillSource): PrivacyStripSource {
  const kind: PrivacyStripSource['kind'] =
    s.kind === 'tool' ? 'connector' : s.kind === 'memory' ? 'memory' : 'message';
  return { kind, id: s.id, label: s.label ?? s.id };
}
