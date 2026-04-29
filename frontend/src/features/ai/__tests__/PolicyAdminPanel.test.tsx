import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { PolicyAdminPanel } from '../PolicyAdminPanel';
import type { WorkspacePolicy } from '../../../types/policy';

const seed: WorkspacePolicy = {
  workspaceId: 'ws_acme',
  allowServerCompute: false,
  serverAllowedTasks: ['draft_artifact'],
  serverDeniedTasks: [],
  maxEgressBytesPerDay: 50_000_000,
  requireRedaction: true,
  updatedAt: '2026-04-29T00:00:00Z',
  updatedBy: 'user_alice',
};

describe('PolicyAdminPanel', () => {
  it('renders the loaded policy fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(seed);
    renderWithProviders(
      <PolicyAdminPanel
        workspaceId="ws_acme"
        injectedFetch={fetcher}
        injectedUpdate={vi.fn()}
      />,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('ws_acme'));
    const allow = await screen.findByTestId('policy-allow-server');
    const allowInput = allow.querySelector('input') as HTMLInputElement;
    expect(allowInput.checked).toBe(false);

    const draft = screen.getByTestId('policy-allowed-draft_artifact');
    expect((draft.querySelector('input') as HTMLInputElement).checked).toBe(true);
  });

  it('toggling and saving calls updateWorkspacePolicy with the patch', async () => {
    const fetcher = vi.fn().mockResolvedValue(seed);
    const updater = vi.fn().mockImplementation(async (_, patch) => ({
      ...seed,
      ...patch,
      serverAllowedTasks: patch.serverAllowedTasks ?? seed.serverAllowedTasks,
      serverDeniedTasks: patch.serverDeniedTasks ?? seed.serverDeniedTasks,
    }));
    renderWithProviders(
      <PolicyAdminPanel
        workspaceId="ws_acme"
        injectedFetch={fetcher}
        injectedUpdate={updater}
      />,
    );
    const allow = await screen.findByTestId('policy-allow-server');
    const allowInput = allow.querySelector('input') as HTMLInputElement;

    const user = userEvent.setup();
    await user.click(allowInput);
    expect(allowInput.checked).toBe(true);

    const saveBtn = screen.getByTestId('policy-save');
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    await waitFor(() => expect(updater).toHaveBeenCalledTimes(1));
    const [wsId, patch] = updater.mock.calls[0];
    expect(wsId).toBe('ws_acme');
    expect(patch.allowServerCompute).toBe(true);
    expect(patch.serverAllowedTasks).toEqual(['draft_artifact']);
  });

  it('enables Save when only an allowed-task checkbox is toggled (regression: Set dirty check)', async () => {
    // Regression test for the Devin Review finding: JSON.stringify on a Set
    // serialises to "{}", so the dirty diff used to be blind to allowed /
    // denied task toggles even though they're the panel's primary purpose.
    const fetcher = vi.fn().mockResolvedValue(seed);
    const updater = vi.fn().mockImplementation(async (_, patch) => ({
      ...seed,
      ...patch,
      serverAllowedTasks: patch.serverAllowedTasks ?? seed.serverAllowedTasks,
      serverDeniedTasks: patch.serverDeniedTasks ?? seed.serverDeniedTasks,
    }));
    renderWithProviders(
      <PolicyAdminPanel
        workspaceId="ws_acme"
        injectedFetch={fetcher}
        injectedUpdate={updater}
      />,
    );

    // Wait for the panel to load and Save to render disabled (no diff yet).
    const saveBtn = await screen.findByTestId('policy-save');
    expect(saveBtn).toBeDisabled();

    // Toggle a task that's not currently in the allowed set.
    const summarize = screen.getByTestId('policy-allowed-summarize');
    const summarizeInput = summarize.querySelector('input') as HTMLInputElement;
    expect(summarizeInput.checked).toBe(false);

    const user = userEvent.setup();
    await user.click(summarizeInput);
    expect(summarizeInput.checked).toBe(true);

    // The Set toggle alone must be enough to enable Save.
    expect(saveBtn).not.toBeDisabled();

    await user.click(saveBtn);
    await waitFor(() => expect(updater).toHaveBeenCalledTimes(1));
    const [, patch] = updater.mock.calls[0];
    expect((patch.serverAllowedTasks as string[]).sort()).toEqual(
      ['draft_artifact', 'summarize'].sort(),
    );
  });

  it('renders an error state when the fetch fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <PolicyAdminPanel
        workspaceId="ws_acme"
        injectedFetch={fetcher}
        injectedUpdate={vi.fn()}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
