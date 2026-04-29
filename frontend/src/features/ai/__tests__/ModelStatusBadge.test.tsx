import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ModelStatusBadge } from '../ModelStatusBadge';
import { renderWithProviders } from '../../../test/renderWithProviders';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('ModelStatusBadge', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('renders the model name and "loaded" state when the backend reports loaded=true', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        loaded: true,
        model: 'ternary-bonsai-8b',
        quant: 'q4_k_m',
        ramUsageMB: 1024,
        sidecar: 'running',
      }),
    );
    renderWithProviders(<ModelStatusBadge pollIntervalMs={0} />);
    await waitFor(() => {
      expect(screen.getByTestId('model-status-badge-name')).toHaveTextContent('ternary-bonsai-8b');
    });
    expect(screen.getByTestId('model-status-badge-state')).toHaveTextContent('loaded');
    expect(screen.getByTestId('model-status-badge')).toHaveClass('model-status-badge--loaded');
  });

  it('renders the "idle" state when the backend reports loaded=false', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        loaded: false,
        model: 'ternary-bonsai-8b',
        quant: 'q4_k_m',
        ramUsageMB: 0,
        sidecar: 'unstarted',
      }),
    );
    renderWithProviders(<ModelStatusBadge pollIntervalMs={0} />);
    await waitFor(() => {
      expect(screen.getByTestId('model-status-badge-state')).toHaveTextContent('idle');
    });
    expect(screen.getByTestId('model-status-badge')).toHaveClass('model-status-badge--idle');
  });

  it('renders a transient loading placeholder before the first response', () => {
    let resolve: ((r: Response) => void) | undefined;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    renderWithProviders(<ModelStatusBadge pollIntervalMs={0} />);
    expect(screen.getByTestId('model-status-badge')).toHaveTextContent(/model/i);
    resolve?.(jsonResponse({ loaded: false, model: 'm', quant: 'q', ramUsageMB: 0, sidecar: 'unstarted' }));
  });

  it('renders nothing when the backend returns an error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const { container } = renderWithProviders(<ModelStatusBadge pollIntervalMs={0} />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="model-status-badge"]')).toBeNull();
    });
  });
});
