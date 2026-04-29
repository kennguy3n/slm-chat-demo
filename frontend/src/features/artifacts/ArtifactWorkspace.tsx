import { useEffect, useMemo, useState } from 'react';
import {
  createArtifactVersion as apiCreateArtifactVersion,
  getArtifact,
  getArtifactVersion,
  updateArtifact,
} from '../../api/kappsApi';
import type { Artifact, ArtifactSourcePin, ArtifactStatus, ArtifactVersion } from '../../types/kapps';
import { SourcePin } from './SourcePin';
import { ArtifactDiffView } from './ArtifactDiffView';
import { splitIntoSections as splitParsedSections } from './sections';
import { OutputReview, type OutputReviewSource } from '../kapps/OutputReview';

interface Props {
  // The artifact to display. The workspace fetches the full artifact
  // (versions with bodies) so the parent can pass either a stripped
  // list-shaped Artifact or a full one — either works.
  artifact: Artifact;
  onClose?: () => void;
  onNavigateSource?: (pin: ArtifactSourcePin) => void;
  // Optional injected fetchers for tests.
  injectedGetArtifact?: typeof getArtifact;
  injectedGetVersion?: typeof getArtifactVersion;
  injectedCreateVersion?: typeof apiCreateArtifactVersion;
  injectedUpdateArtifact?: typeof updateArtifact;
}

interface Section {
  id: string;
  heading: string;
  body: string;
  pins: ArtifactSourcePin[];
}

// splitIntoSections segments a markdown body by `# ...` headings.
// Implementation lives in `./sections` so other modules (e.g. the
// ThreadPanel that creates source pins from the streamed draft body)
// can produce sectionIds that match the renderer's slug format.
function splitIntoSections(body: string): Section[] {
  return splitParsedSections(body).map((s) => ({
    id: s.id,
    heading: s.heading,
    body: s.body,
    pins: [],
  }));
}

function buildSections(version: ArtifactVersion | null): Section[] {
  if (!version) return [];
  const secs = splitIntoSections(version.body ?? '');
  for (const pin of version.sourcePins ?? []) {
    const target = secs.find((s) => s.id === pin.sectionId);
    if (target) target.pins.push(pin);
    else if (secs.length > 0) secs[0].pins.push(pin);
  }
  return secs;
}

// ArtifactWorkspace — the right-panel artifact viewer (ARCHITECTURE.md
// module #8). Loads the full artifact, displays the latest version's
// body inline with source pins, and supports new-version, publish, and
// version diff actions.
export function ArtifactWorkspace({
  artifact: initialArtifact,
  onClose,
  onNavigateSource,
  injectedGetArtifact,
  injectedGetVersion,
  injectedCreateVersion,
  injectedUpdateArtifact,
}: Props) {
  const fetchArtifact = injectedGetArtifact ?? getArtifact;
  const fetchVersion = injectedGetVersion ?? getArtifactVersion;
  const submitNewVersion = injectedCreateVersion ?? apiCreateArtifactVersion;
  const patchArtifact = injectedUpdateArtifact ?? updateArtifact;

  const [artifact, setArtifact] = useState<Artifact>(initialArtifact);
  const [selectedVersion, setSelectedVersion] = useState<number>(
    initialArtifact.versions[initialArtifact.versions.length - 1]?.version ?? 1,
  );
  const [versionBodies, setVersionBodies] = useState<Record<number, ArtifactVersion>>({});
  const [editing, setEditing] = useState(false);
  const [editorBody, setEditorBody] = useState('');
  const [editorSummary, setEditorSummary] = useState('');
  const [diffWith, setDiffWith] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ArtifactStatus | null>(null);

  // Fetch full artifact (with bodies) on mount when it looks list-shaped.
  useEffect(() => {
    let cancelled = false;
    if (!initialArtifact.versions.some((v) => v.body)) {
      fetchArtifact(initialArtifact.id)
        .then((full) => {
          if (cancelled) return;
          setArtifact(full);
          const next = full.versions[full.versions.length - 1];
          if (next) setSelectedVersion(next.version);
        })
        .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    }
    return () => {
      cancelled = true;
    };
  }, [fetchArtifact, initialArtifact.id, initialArtifact.versions]);

  const currentVersion = useMemo<ArtifactVersion | null>(() => {
    const onArtifact = artifact.versions.find((v) => v.version === selectedVersion);
    if (onArtifact?.body) return onArtifact;
    if (versionBodies[selectedVersion]) return versionBodies[selectedVersion];
    return onArtifact ?? null;
  }, [artifact.versions, selectedVersion, versionBodies]);

  // If the user picks a version we haven't fetched the body for, lazy-load it.
  useEffect(() => {
    if (!currentVersion || currentVersion.body || versionBodies[selectedVersion]) return;
    let cancelled = false;
    fetchVersion(artifact.id, selectedVersion)
      .then((v) => {
        if (cancelled) return;
        setVersionBodies((prev) => ({ ...prev, [selectedVersion]: v }));
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [artifact.id, currentVersion, fetchVersion, selectedVersion, versionBodies]);

  const sections = useMemo(() => buildSections(currentVersion), [currentVersion]);

  function startEdit() {
    setEditorBody(currentVersion?.body ?? '');
    setEditorSummary('');
    setEditing(true);
    setErr(null);
  }

  async function handleSaveVersion() {
    setBusy(true);
    setErr(null);
    try {
      const v = await submitNewVersion(artifact.id, {
        body: editorBody,
        summary: editorSummary,
        sourcePins: currentVersion?.sourcePins ?? [],
      });
      setArtifact((prev) => ({ ...prev, versions: [...prev.versions, v] }));
      setVersionBodies((prev) => ({ ...prev, [v.version]: v }));
      setSelectedVersion(v.version);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(status: ArtifactStatus) {
    setBusy(true);
    setErr(null);
    try {
      const next = await patchArtifact(artifact.id, { status });
      setArtifact((prev) => ({ ...prev, status: next.status }));
      setPendingStatus(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function requestStatus(status: ArtifactStatus) {
    setPendingStatus(status);
  }

  // Source pins on the current version feed the OutputReview gate so
  // the user sees every excerpt that informed the artifact before
  // confirming the status transition.
  const reviewSources: OutputReviewSource[] = (currentVersion?.sourcePins ?? []).map(
    (p, i) => ({
      id: p.sourceMessageId ?? `pin_${i}`,
      label: p.sender ? `${p.sender}` : 'Source pin',
      excerpt: p.excerpt,
    }),
  );

  // Compute the diff against an earlier version when requested.
  const diffSource = useMemo<ArtifactVersion | null>(() => {
    if (diffWith == null) return null;
    return (
      artifact.versions.find((v) => v.version === diffWith) ??
      versionBodies[diffWith] ??
      null
    );
  }, [artifact.versions, diffWith, versionBodies]);

  const reversed = [...artifact.versions].sort((a, b) => b.version - a.version);

  return (
    <section className="artifact-workspace" data-testid="artifact-workspace">
      <header className="artifact-workspace__header">
        <div>
          <h2 className="artifact-workspace__title">
            <span className="artifact-workspace__type">{artifact.type}</span>
            {artifact.title}
          </h2>
          <p className="artifact-workspace__meta">
            <span
              className={`artifact-workspace__status artifact-workspace__status--${artifact.status}`}
              data-testid="artifact-workspace-status"
            >
              {artifact.status}
            </span>
            <span> · v{selectedVersion}</span>
          </p>
        </div>
        <div className="artifact-workspace__header-actions">
          <button
            type="button"
            disabled={busy || editing}
            onClick={startEdit}
            data-testid="artifact-workspace-new-version"
          >
            New version
          </button>
          {artifact.status !== 'in_review' && artifact.status !== 'published' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => requestStatus('in_review')}
              data-testid="artifact-workspace-submit-review"
            >
              Submit for review
            </button>
          )}
          {artifact.status !== 'published' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => requestStatus('published')}
              data-testid="artifact-workspace-publish"
            >
              Publish
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="artifact-workspace__close"
              data-testid="artifact-workspace-close"
            >
              Close
            </button>
          )}
        </div>
      </header>

      {err && (
        <p className="artifact-workspace__error" role="alert">
          {err}
        </p>
      )}

      <div className="artifact-workspace__layout">
        <main className="artifact-workspace__body" data-testid="artifact-workspace-body">
          {editing ? (
            <div className="artifact-workspace__editor">
              <label>
                <span>Summary</span>
                <input
                  type="text"
                  value={editorSummary}
                  onChange={(e) => setEditorSummary(e.target.value)}
                  data-testid="artifact-workspace-editor-summary"
                />
              </label>
              <textarea
                value={editorBody}
                onChange={(e) => setEditorBody(e.target.value)}
                rows={18}
                aria-label="Artifact body"
                data-testid="artifact-workspace-editor-body"
              />
              <div className="artifact-workspace__editor-actions">
                <button
                  type="button"
                  disabled={busy || !editorBody.trim()}
                  onClick={handleSaveVersion}
                  data-testid="artifact-workspace-save-version"
                >
                  {busy ? 'Saving…' : 'Save new version'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                  data-testid="artifact-workspace-editor-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : sections.length === 0 ? (
            <p className="artifact-workspace__empty">No body for this version.</p>
          ) : (
            sections.map((s) => (
              <section
                key={s.id}
                className="artifact-workspace__section"
                data-section-id={s.id}
              >
                {s.heading && <h3>{s.heading}</h3>}
                <pre className="artifact-workspace__section-body">{s.body}</pre>
                {s.pins.length > 0 && (
                  <div className="artifact-workspace__pins" data-testid={`pins-${s.id}`}>
                    {s.pins.map((p, i) => (
                      <SourcePin
                        key={`${p.sourceMessageId ?? p.sectionId}-${i}`}
                        pin={p}
                        index={i}
                        onNavigate={onNavigateSource}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
          )}

          {diffSource && currentVersion && (
            <ArtifactDiffView
              fromBody={diffSource.body ?? ''}
              toBody={currentVersion.body ?? ''}
              fromVersion={diffSource.version}
              toVersion={currentVersion.version}
            />
          )}
        </main>
        <aside className="artifact-workspace__history" data-testid="artifact-workspace-history">
          <h4>Versions</h4>
          <ol>
            {reversed.map((v) => (
              <li key={v.version} className="artifact-workspace__version-row">
                <button
                  type="button"
                  onClick={() => setSelectedVersion(v.version)}
                  className={
                    v.version === selectedVersion
                      ? 'artifact-workspace__version-row--active'
                      : ''
                  }
                  data-testid={`artifact-workspace-version-${v.version}`}
                >
                  v{v.version} — {v.summary || v.author}
                </button>
                {v.version !== selectedVersion && (
                  <button
                    type="button"
                    className="artifact-workspace__version-diff"
                    onClick={() => setDiffWith(v.version)}
                    data-testid={`artifact-workspace-diff-${v.version}`}
                  >
                    Diff vs current
                  </button>
                )}
              </li>
            ))}
          </ol>
          {diffWith != null && (
            <button
              type="button"
              className="artifact-workspace__diff-clear"
              onClick={() => setDiffWith(null)}
              data-testid="artifact-workspace-diff-clear"
            >
              Clear diff
            </button>
          )}
        </aside>
      </div>

      {pendingStatus && (
        <OutputReview
          objectKind="artifact-status"
          targetStatus={pendingStatus}
          heading={
            pendingStatus === 'published'
              ? 'Confirm publish'
              : 'Confirm submit for review'
          }
          description={
            pendingStatus === 'published'
              ? 'Publishing locks v' + selectedVersion + ' as the canonical version. Review the body and sources before confirming.'
              : 'Moving to in_review marks the current draft as ready for reviewers. Confirm the body and sources are correct.'
          }
          content={currentVersion?.body ?? ''}
          sources={reviewSources}
          // Status transitions only PATCH `status`; the body itself is
          // versioned through the version flow, not the status flow.
          // Disable inline editing here so user edits cannot silently
          // diverge from the persisted artifact body.
          allowEdit={false}
          onAccept={() => handleStatus(pendingStatus)}
          onDiscard={() => setPendingStatus(null)}
        />
      )}
    </section>
  );
}
