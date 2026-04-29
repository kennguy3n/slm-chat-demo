import { computeLineDiff } from './lineDiff';

interface Props {
  fromBody: string;
  toBody: string;
  fromVersion: number;
  toVersion: number;
}

// ArtifactDiffView — inline (unified) line-by-line diff. Emits one row
// per line, badged with `+`, `-`, or a leading space for context.
export function ArtifactDiffView({ fromBody, toBody, fromVersion, toVersion }: Props) {
  const lines = computeLineDiff(fromBody, toBody);
  return (
    <div className="artifact-diff" data-testid="artifact-diff">
      <header className="artifact-diff__header">
        Comparing v{fromVersion} ↔ v{toVersion}
      </header>
      <ol className="artifact-diff__list">
        {lines.map((l, idx) => (
          <li
            key={idx}
            className={`artifact-diff__line artifact-diff__line--${l.kind}`}
            data-kind={l.kind}
          >
            <span className="artifact-diff__marker" aria-hidden="true">
              {l.kind === 'added' ? '+' : l.kind === 'removed' ? '−' : ' '}
            </span>
            <span className="artifact-diff__text">{l.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
