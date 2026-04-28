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
  model: 'gemma-4-e2b',
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
