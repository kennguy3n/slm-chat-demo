import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShoppingNudgesPanel } from '../ShoppingNudgesPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as aiApi from '../../../api/aiApi';
import type { ShoppingNudgesResponse } from '../../../types/ai';

const fakeResp: ShoppingNudgesResponse = {
  channelId: 'ch_family',
  nudges: [
    { item: 'Sunscreen', reason: 'Field trip is tomorrow', sourceMessageId: 'm1' },
    { item: 'Milk', reason: 'We are out', sourceMessageId: 'm2' },
  ],
  sourceMessageIds: ['m1', 'm2'],
  model: 'ternary-bonsai-8b',
  tier: 'e2b',
  reason: 'Routed shopping nudges to E2B.',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('ShoppingNudgesPanel', () => {
  beforeEach(() => {
    vi.spyOn(aiApi, 'fetchShoppingNudges').mockResolvedValue(fakeResp);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds and removes items locally', async () => {
    renderWithProviders(
      <ShoppingNudgesPanel channelId="ch_family" channelName="Family group" />,
    );
    await userEvent.type(screen.getByTestId('shopping-nudges-draft'), 'Bananas');
    await userEvent.click(screen.getByTestId('shopping-nudges-add'));
    expect(screen.getByText('Bananas')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('shopping-nudges-remove-0'));
    expect(screen.queryByText('Bananas')).not.toBeInTheDocument();
  });

  it('shows nudges and allows accepting one onto the list', async () => {
    renderWithProviders(
      <ShoppingNudgesPanel channelId="ch_family" channelName="Family group" />,
    );
    await userEvent.click(screen.getByTestId('shopping-nudges-run'));
    await waitFor(() =>
      expect(screen.getByTestId('shopping-nudges-nudges')).toBeInTheDocument(),
    );
    expect(screen.getByText('Sunscreen')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('shopping-nudges-accept-0'));
    // After acceptance the Sunscreen nudge collapses and the item lands on the list.
    await waitFor(() =>
      expect(screen.getByTestId('shopping-nudges-list')).toHaveTextContent('Sunscreen'),
    );
    const nudges = screen.getByTestId('shopping-nudges-nudges');
    expect(nudges).not.toHaveTextContent('Sunscreen');
    expect(nudges).toHaveTextContent('Milk');
  });

  it('passes the existing list into the IPC call', async () => {
    renderWithProviders(<ShoppingNudgesPanel channelId="ch_family" />);
    await userEvent.type(screen.getByTestId('shopping-nudges-draft'), 'Bananas');
    await userEvent.click(screen.getByTestId('shopping-nudges-add'));
    await userEvent.click(screen.getByTestId('shopping-nudges-run'));
    await waitFor(() =>
      expect(aiApi.fetchShoppingNudges).toHaveBeenCalledWith({
        channelId: 'ch_family',
        existingItems: ['Bananas'],
      }),
    );
  });

  it('dedupes accepted nudges against the local list case-insensitively', async () => {
    renderWithProviders(<ShoppingNudgesPanel channelId="ch_family" />);
    // User has already added "sunscreen" lowercase to the list.
    await userEvent.type(screen.getByTestId('shopping-nudges-draft'), 'sunscreen');
    await userEvent.click(screen.getByTestId('shopping-nudges-add'));
    await userEvent.click(screen.getByTestId('shopping-nudges-run'));
    await waitFor(() =>
      expect(screen.getByTestId('shopping-nudges-nudges')).toBeInTheDocument(),
    );
    // The model returns "Sunscreen" (different casing) — accepting it must
    // not produce a second list entry.
    await userEvent.click(screen.getByTestId('shopping-nudges-accept-0'));
    const list = screen.getByTestId('shopping-nudges-list');
    const matches = list.querySelectorAll('li');
    expect(matches).toHaveLength(1);
    expect(list).toHaveTextContent('sunscreen');
  });

  it('clears AI nudges (but keeps the local list) when the channel changes', async () => {
    function Harness() {
      const [id, setId] = React.useState<string>('ch_family');
      return (
        <>
          <button data-testid="harness-switch" onClick={() => setId('ch_other')}>
            switch
          </button>
          <ShoppingNudgesPanel channelId={id} channelName={id} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    // Add a hand-curated item — this list is intentionally cross-channel.
    await userEvent.type(screen.getByTestId('shopping-nudges-draft'), 'Bananas');
    await userEvent.click(screen.getByTestId('shopping-nudges-add'));
    await userEvent.click(screen.getByTestId('shopping-nudges-run'));
    await waitFor(() =>
      expect(screen.getByTestId('shopping-nudges-nudges')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByTestId('harness-switch'));
    // AI nudges are gone (they were generated from ch_family) ...
    expect(screen.queryByTestId('shopping-nudges-nudges')).toBeNull();
    // ... but the user's manually curated list survives the channel switch.
    expect(screen.getByTestId('shopping-nudges-list')).toHaveTextContent('Bananas');
  });

  it('renders the privacy strip with on-device routing details', async () => {
    renderWithProviders(<ShoppingNudgesPanel channelId="ch_family" />);
    await userEvent.click(screen.getByTestId('shopping-nudges-run'));
    await waitFor(() =>
      expect(screen.getByText('Routed shopping nudges to E2B.')).toBeInTheDocument(),
    );
  });
});
