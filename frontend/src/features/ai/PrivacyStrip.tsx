import { useQuery } from '@tanstack/react-query';
import type { PrivacyStripCallbacks, PrivacyStripData } from '../../types/ai';
import { fetchEgressPreview, fetchModelStatus } from '../../api/aiApi';

interface Props extends PrivacyStripCallbacks {
  data: PrivacyStripData;
  // When true, the strip overlays the live model.status / egress-preview
  // values from the backend on top of the static `data` prop. Tests pass
  // false to keep the rendering deterministic without mocking fetch.
  syncWithBackend?: boolean;
}

const COMPUTE_LABEL: Record<PrivacyStripData['computeLocation'], string> = {
  on_device: 'On-device',
  confidential_server: 'Confidential server',
  shared_server: 'Shared server',
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '0 B';
  if (n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// PrivacyStrip renders the eight required AI UI elements from PROPOSAL.md
// section 4.3 below an AI-generated card. It optionally syncs with the
// backend's model status and egress preview endpoints; for Phase 0 those
// return on-device + zero-egress values so the strip always shows the
// privacy-positive state.
export function PrivacyStrip({ data, syncWithBackend = false, onAccept, onEdit, onDiscard }: Props) {
  const modelStatus = useQuery({
    queryKey: ['model', 'status'],
    queryFn: fetchModelStatus,
    enabled: syncWithBackend,
    staleTime: 30_000,
  });
  const egress = useQuery({
    queryKey: ['privacy', 'egress-preview'],
    queryFn: fetchEgressPreview,
    enabled: syncWithBackend,
    staleTime: 30_000,
  });

  const modelName = syncWithBackend && modelStatus.data?.model ? modelStatus.data.model : data.modelName;
  const dataEgressBytes =
    syncWithBackend && egress.data ? egress.data.egressBytes : data.dataEgressBytes;

  const confidencePct =
    typeof data.confidence === 'number' ? Math.round(data.confidence * 100) : null;

  return (
    <aside
      className="privacy-strip"
      role="complementary"
      aria-label="AI privacy details"
      data-testid="privacy-strip"
    >
      <div className="privacy-strip__row">
        <span className="privacy-strip__label">Compute</span>
        <span className="privacy-strip__value" data-testid="privacy-compute">
          {COMPUTE_LABEL[data.computeLocation]}
        </span>
      </div>
      <div className="privacy-strip__row">
        <span className="privacy-strip__label">Model</span>
        <span className="privacy-strip__value" data-testid="privacy-model">
          {modelName}
        </span>
      </div>
      <div className="privacy-strip__row">
        <span className="privacy-strip__label">Egress</span>
        <span className="privacy-strip__value" data-testid="privacy-egress">
          {formatBytes(dataEgressBytes)}
        </span>
      </div>
      <div className="privacy-strip__row">
        <span className="privacy-strip__label">Sources</span>
        <ul className="privacy-strip__sources" data-testid="privacy-sources">
          {data.sources.length === 0 ? (
            <li className="privacy-strip__empty">No external sources used.</li>
          ) : (
            data.sources.map((s) => (
              <li key={s.id}>
                <span className={`privacy-strip__source-kind privacy-strip__source-kind--${s.kind}`}>
                  {s.kind}
                </span>{' '}
                {s.label}
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="privacy-strip__row">
        <span className="privacy-strip__label">Confidence</span>
        <span className="privacy-strip__value" data-testid="privacy-confidence">
          {confidencePct === null ? 'unknown' : `${confidencePct}%`}
          {data.missingInfo && data.missingInfo.length > 0 && (
            <span className="privacy-strip__missing">
              {' '}
              · missing: {data.missingInfo.join(', ')}
            </span>
          )}
        </span>
      </div>
      <div className="privacy-strip__row">
        <span className="privacy-strip__label">Why</span>
        <span className="privacy-strip__value" data-testid="privacy-why">
          {data.whySuggested}
        </span>
      </div>
      <div className="privacy-strip__row privacy-strip__row--origin">
        <span className="privacy-strip__label">Origin</span>
        <a
          href={`#${data.origin.kind}-${data.origin.id}`}
          className="privacy-strip__origin"
          data-testid="privacy-origin"
        >
          {data.origin.label}
        </a>
      </div>
      <div className="privacy-strip__actions" role="group" aria-label="Privacy strip actions">
        <button type="button" onClick={onAccept} data-testid="privacy-accept">
          Accept
        </button>
        <button type="button" onClick={onEdit} data-testid="privacy-edit">
          Edit
        </button>
        <button type="button" onClick={onDiscard} data-testid="privacy-discard">
          Discard
        </button>
      </div>
    </aside>
  );
}
