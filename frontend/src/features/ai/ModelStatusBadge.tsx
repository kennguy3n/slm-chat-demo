import { useQuery } from '@tanstack/react-query';
import { fetchModelStatus } from '../../api/aiApi';

interface Props {
  // Poll interval in ms. Defaults to 5s per the Phase 1 spec; tests can
  // disable polling by passing 0/false through TanStack Query semantics.
  pollIntervalMs?: number;
}

// ModelStatusBadge renders a small inline badge showing the current local
// model's name and loaded state. It is intended for chrome surfaces such as
// the TopBar where DeviceCapabilityPanel is too heavy. The badge degrades
// silently (renders nothing) while the first response is in flight or when
// the backend reports an error so the TopBar layout stays stable.
export function ModelStatusBadge({ pollIntervalMs = 5_000 }: Props = {}) {
  const status = useQuery({
    queryKey: ['model', 'status'],
    queryFn: fetchModelStatus,
    refetchInterval: pollIntervalMs > 0 ? pollIntervalMs : false,
  });

  if (status.isLoading) {
    return (
      <span
        className="topbar__badge model-status-badge model-status-badge--loading"
        data-testid="model-status-badge"
        aria-busy="true"
      >
        Model…
      </span>
    );
  }
  if (status.isError || !status.data?.model) {
    return null;
  }

  const { model, loaded } = status.data;
  const state = loaded ? 'loaded' : 'idle';
  return (
    <span
      className={`topbar__badge model-status-badge model-status-badge--${state}`}
      data-testid="model-status-badge"
      title={`Local model: ${model} (${state})`}
    >
      <span className="model-status-badge__name" data-testid="model-status-badge-name">
        {model}
      </span>
      <span aria-hidden> · </span>
      <span className="model-status-badge__state" data-testid="model-status-badge-state">
        {state}
      </span>
    </span>
  );
}
