import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceCapabilityPanel } from '../DeviceCapabilityPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('DeviceCapabilityPanel', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('renders model name, loaded badge, quant, RAM, and sidecar from the backend', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        loaded: true,
        model: 'gemma-4-e2b',
        quant: 'q4_k_m',
        ramUsageMB: 1234,
        sidecar: 'running',
      }),
    );
    renderWithProviders(<DeviceCapabilityPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('device-capability-model')).toHaveTextContent('gemma-4-e2b');
    });
    expect(screen.getByTestId('device-capability-loaded')).toHaveTextContent('Loaded');
    expect(screen.getByTestId('device-capability-quant')).toHaveTextContent('q4_k_m');
    expect(screen.getByTestId('device-capability-ram')).toHaveTextContent('1,234 MB');
    expect(screen.getByTestId('device-capability-sidecar')).toHaveTextContent('running');
  });

  it('shows an unloaded badge when loaded=false', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        loaded: false,
        model: 'gemma-4-e2b',
        quant: 'q4_k_m',
        ramUsageMB: 0,
        sidecar: 'unstarted',
      }),
    );
    renderWithProviders(<DeviceCapabilityPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('device-capability-loaded')).toHaveTextContent('Unloaded');
    });
  });

  it('shows an error message on a 500 response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderWithProviders(<DeviceCapabilityPanel />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
    });
  });

  it('clicking "Load model" POSTs to /api/model/load', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          loaded: false,
          model: 'gemma-4-e2b',
          quant: 'q4_k_m',
          ramUsageMB: 0,
          sidecar: 'unstarted',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ loaded: true, model: 'gemma-4-e2b' }))
      .mockResolvedValue(
        jsonResponse({
          loaded: true,
          model: 'gemma-4-e2b',
          quant: 'q4_k_m',
          ramUsageMB: 1024,
          sidecar: 'running',
        }),
      );

    renderWithProviders(<DeviceCapabilityPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('device-capability-load')).toBeEnabled();
    });
    await userEvent.click(screen.getByTestId('device-capability-load'));
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/api/model/load');
    });
  });

  it('clicking "Unload model" POSTs to /api/model/unload', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          loaded: true,
          model: 'gemma-4-e2b',
          quant: 'q4_k_m',
          ramUsageMB: 512,
          sidecar: 'running',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ loaded: false, model: 'gemma-4-e2b' }))
      .mockResolvedValue(
        jsonResponse({
          loaded: false,
          model: 'gemma-4-e2b',
          quant: 'q4_k_m',
          ramUsageMB: 0,
          sidecar: 'unstarted',
        }),
      );
    renderWithProviders(<DeviceCapabilityPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('device-capability-unload')).toBeEnabled();
    });
    await userEvent.click(screen.getByTestId('device-capability-unload'));
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/api/model/unload');
    });
  });
});
