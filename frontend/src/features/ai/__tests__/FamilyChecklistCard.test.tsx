import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FamilyChecklistCard } from '../FamilyChecklistCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as aiApi from '../../../api/aiApi';
import type { FamilyChecklistResponse } from '../../../types/ai';

const fakeResp: FamilyChecklistResponse = {
  channelId: 'ch_family',
  title: 'Checklist — Soccer practice tomorrow',
  items: [
    { title: 'Bring water bottles', dueHint: 'tonight', sourceMessageId: 'm1' },
    { title: 'Pack shin guards', sourceMessageId: 'm2' },
  ],
  sourceMessageIds: ['m1', 'm2'],
  model: 'ternary-bonsai-8b',
  tier: 'e2b',
  reason: 'Routed family checklist to E2B.',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('FamilyChecklistCard', () => {
  beforeEach(() => {
    vi.spyOn(aiApi, 'fetchFamilyChecklist').mockResolvedValue(fakeResp);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the run button when no chat is selected', () => {
    renderWithProviders(<FamilyChecklistCard channelId={null} />);
    expect(screen.getByTestId('family-checklist-run')).toBeDisabled();
  });

  it('renders the checklist after a successful run', async () => {
    renderWithProviders(
      <FamilyChecklistCard channelId="ch_family" channelName="Family group" />,
    );
    await userEvent.type(
      screen.getByTestId('family-checklist-hint'),
      'Soccer practice tomorrow',
    );
    await userEvent.click(screen.getByTestId('family-checklist-run'));
    await waitFor(() =>
      expect(screen.getByTestId('family-checklist-list')).toBeInTheDocument(),
    );
    expect(screen.getByText('Bring water bottles')).toBeInTheDocument();
    expect(screen.getByText('Pack shin guards')).toBeInTheDocument();
    expect(screen.getByText('Routed family checklist to E2B.')).toBeInTheDocument();
    expect(aiApi.fetchFamilyChecklist).toHaveBeenCalledWith({
      channelId: 'ch_family',
      eventHint: 'Soccer practice tomorrow',
    });
  });

  it('clears prior results when the active channel changes', async () => {
    function Harness() {
      const [id, setId] = React.useState<string>('ch_family');
      return (
        <>
          <button data-testid="harness-switch" onClick={() => setId('ch_other')}>
            switch
          </button>
          <FamilyChecklistCard
            channelId={id}
            channelName={id === 'ch_family' ? 'Family group' : 'Other group'}
          />
        </>
      );
    }
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByTestId('family-checklist-run'));
    await waitFor(() =>
      expect(screen.getByTestId('family-checklist-list')).toBeInTheDocument(),
    );
    // Switch to a different channel — the previously generated checklist
    // (which was about ch_family) must NOT remain visible mislabeled with
    // the new channel name.
    await userEvent.click(screen.getByTestId('harness-switch'));
    expect(screen.queryByTestId('family-checklist-list')).toBeNull();
    expect(screen.queryByText('Bring water bottles')).toBeNull();
  });

  it('shows an error alert when the IPC call fails', async () => {
    vi.spyOn(aiApi, 'fetchFamilyChecklist').mockRejectedValueOnce(new Error('boom'));
    renderWithProviders(
      <FamilyChecklistCard channelId="ch_family" channelName="Family group" />,
    );
    await userEvent.click(screen.getByTestId('family-checklist-run'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Checklist failed: boom'),
    );
  });
});
