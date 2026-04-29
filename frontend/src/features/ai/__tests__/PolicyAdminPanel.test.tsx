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

  it('keeps the form mounted and shows an inline save error when the save fails (regression)', async () => {
    // Regression test: a save failure must not replace the entire form
    // with a "Failed to load policy" dead-end. The form stays mounted, the
    // user's edits are preserved, and the inline save error is shown.
    const fetcher = vi.fn().mockResolvedValue(seed);
    const updater = vi.fn().mockRejectedValue(new Error('save kaboom'));
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

    await user.click(screen.getByTestId('policy-save'));

    // Inline error appears, form is still mounted, and the user's edit
    // (allowServerCompute = true) is still in the DOM — not nuked by an
    // early-return error screen.
    const inlineError = await screen.findByTestId('policy-save-error');
    expect(inlineError).toHaveTextContent('save kaboom');
    expect(screen.getByTestId('policy-admin-panel')).toBeInTheDocument();
    expect(screen.getByTestId('policy-save')).toBeInTheDocument();
    expect(
      (screen.getByTestId('policy-allow-server').querySelector('input') as HTMLInputElement)
        .checked,
    ).toBe(true);
    // The "Failed to load policy" dead-end must NOT appear.
    expect(screen.queryByText(/Failed to load policy/i)).not.toBeInTheDocument();
  });

  it('clears stale loadError when workspaceId changes and the new fetch succeeds (regression)', async () => {
    // Regression test: useEffect must reset loadError when re-running
    // after workspaceId changes, otherwise the early-return error
    // screen masks the successfully-loaded new policy.
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('first-load-boom'))
      .mockResolvedValueOnce({ ...seed, workspaceId: 'ws_other' });
    const { rerender } = renderWithProviders(
      <PolicyAdminPanel
        workspaceId="ws_acme"
        injectedFetch={fetcher}
        injectedUpdate={vi.fn()}
      />,
    );

    // First fetch fails -> dead-end error screen renders.
    expect(await screen.findByRole('alert')).toHaveTextContent('first-load-boom');
    expect(screen.queryByTestId('policy-save')).not.toBeInTheDocument();

    // Switch workspace; second fetch resolves successfully.
    rerender(
      <PolicyAdminPanel
        workspaceId="ws_other"
        injectedFetch={fetcher}
        injectedUpdate={vi.fn()}
      />,
    );

    // The form now appears and the stale "Failed to load policy" copy
    // is gone.
    await screen.findByTestId('policy-save');
    expect(screen.queryByText(/Failed to load policy/i)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(2, 'ws_other');
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
