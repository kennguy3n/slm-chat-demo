import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B2CLayout } from '../B2CLayout';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Channel } from '../../types/workspace';

const chats: Channel[] = [
  {
    id: 'ch_dm',
    workspaceId: 'ws_personal',
    name: 'Bob Martinez',
    kind: 'dm',
    context: 'b2c',
    memberIds: ['user_alice', 'user_bob'],
  },
  {
    id: 'ch_family',
    workspaceId: 'ws_personal',
    name: 'Family Group',
    kind: 'family',
    context: 'b2c',
    memberIds: ['user_alice', 'user_bob'],
  },
  {
    id: 'ch_neighborhood',
    workspaceId: 'ws_personal',
    name: 'Neighborhood Community',
    kind: 'community',
    context: 'b2c',
    memberIds: ['user_alice', 'user_carol'],
  },
];

describe('B2CLayout', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    useWorkspaceStore.setState({
      context: 'b2c',
      workspaceId: null,
      selectedChatId: null,
      selectedThreadId: null,
    });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  afterEach(() => fetchSpy.mockReset());

  it('renders sidebar sections for personal, family, and community chats', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByRole('heading', { name: /personal chats/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /family groups/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /community groups/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bob martinez/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /family group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neighborhood community/i })).toBeInTheDocument();
    // Wait for the (always-mounted) AIMemoryPage to finish its initial
    // async load so we don't trigger React's act() warning.
    await waitFor(() => expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument());
  });

  it('mounts the morning digest panel in the right rail', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByTestId('morning-digest-panel')).toBeInTheDocument();
    expect(screen.getByTestId('morning-digest-empty')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument(),
    );
  });

  it('preserves the local shopping list across right-rail tab switches', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    // Let AIMemoryPage finish its initial load before driving the UI.
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId('b2c-right-tab-shopping'));
    await userEvent.type(screen.getByTestId('shopping-nudges-draft'), 'Bananas');
    await userEvent.click(screen.getByTestId('shopping-nudges-add'));
    expect(screen.getByTestId('shopping-nudges-list')).toHaveTextContent('Bananas');

    // Switch away to the memory tab, then back; the locally-curated list
    // must still be there (panels stay mounted).
    await userEvent.click(screen.getByTestId('b2c-right-tab-memory'));
    await userEvent.click(screen.getByTestId('b2c-right-tab-shopping'));
    expect(screen.getByTestId('shopping-nudges-list')).toHaveTextContent('Bananas');
  });
});
