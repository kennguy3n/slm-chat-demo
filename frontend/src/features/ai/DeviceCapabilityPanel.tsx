import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchModelStatus, loadModel, unloadModel } from '../../api/aiApi';

// DeviceCapabilityPanel renders the local-model status panel described in
// ARCHITECTURE.md module #10: model name, loaded/unloaded badge, quant
// level, RAM usage, sidecar status, and load/unload buttons. It polls the
// backend's /api/model/status every 10 seconds via TanStack Query.
export function DeviceCapabilityPanel() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['model', 'status'],
    queryFn: fetchModelStatus,
    refetchInterval: 10_000,
  });

  const loadMut = useMutation({
    mutationFn: () => loadModel(status.data?.model),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['model', 'status'] });
    },
  });
  const unloadMut = useMutation({
    mutationFn: () => unloadModel(status.data?.model),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['model', 'status'] });
    },
  });

  if (status.isLoading) {
    return (
      <aside
        className="device-capability-panel device-capability-panel--loading"
        data-testid="device-capability-panel"
        aria-busy="true"
      >
        <h3 className="device-capability-panel__title">Local model</h3>
        <p>Loading status…</p>
      </aside>
    );
  }
  if (status.isError || !status.data) {
    return (
      <aside
        className="device-capability-panel device-capability-panel--error"
        data-testid="device-capability-panel"
      >
        <h3 className="device-capability-panel__title">Local model</h3>
        <p role="alert">Could not load model status.</p>
      </aside>
    );
  }

  const s = status.data;
  const webgpu =
    typeof navigator !== 'undefined' && 'gpu' in navigator ? 'WebGPU available' : 'WebGPU unavailable';
  const ramApi = (typeof navigator !== 'undefined'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    : undefined) as number | undefined;
  const deviceRAM = typeof ramApi === 'number' ? `${ramApi} GB` : 'unknown';

  return (
    <aside className="device-capability-panel" data-testid="device-capability-panel">
      <h3 className="device-capability-panel__title">Local model</h3>
      <dl className="device-capability-panel__grid">
        <dt>E2B model</dt>
        <dd data-testid="device-capability-model">{s.model}</dd>
        <dt>E2B status</dt>
        <dd>
          <span
            className={`device-capability-panel__badge device-capability-panel__badge--${s.loaded ? 'loaded' : 'unloaded'}`}
            data-testid="device-capability-loaded"
          >
            {s.loaded ? 'Loaded' : 'Unloaded'}
          </span>
        </dd>
        <dt>E4B model</dt>
        <dd data-testid="device-capability-e4b-model">
          {s.hasE4B ? s.e4bModel ?? '—' : 'Not pulled'}
        </dd>
        <dt>E4B status</dt>
        <dd>
          <span
            className={`device-capability-panel__badge device-capability-panel__badge--${
              s.hasE4B ? (s.e4bLoaded ? 'loaded' : 'unloaded') : 'unavailable'
            }`}
            data-testid="device-capability-e4b-loaded"
          >
            {s.hasE4B ? (s.e4bLoaded ? 'Loaded' : 'Unloaded') : 'Falls back to E2B'}
          </span>
        </dd>
        <dt>Quant</dt>
        <dd data-testid="device-capability-quant">{s.quant}</dd>
        <dt>RAM (model)</dt>
        <dd data-testid="device-capability-ram">{(s.ramUsageMB ?? 0).toLocaleString()} MB</dd>
        <dt>Sidecar</dt>
        <dd data-testid="device-capability-sidecar">{s.sidecar}</dd>
        <dt>Device RAM</dt>
        <dd data-testid="device-capability-device-ram">{deviceRAM}</dd>
        <dt>WebGPU</dt>
        <dd data-testid="device-capability-webgpu">{webgpu}</dd>
      </dl>
      <div className="device-capability-panel__actions">
        <button
          type="button"
          onClick={() => loadMut.mutate()}
          disabled={loadMut.isPending}
          data-testid="device-capability-load"
        >
          {loadMut.isPending ? 'Loading…' : 'Load model'}
        </button>
        <button
          type="button"
          onClick={() => unloadMut.mutate()}
          disabled={unloadMut.isPending}
          data-testid="device-capability-unload"
        >
          {unloadMut.isPending ? 'Unloading…' : 'Unload model'}
        </button>
      </div>
    </aside>
  );
}
