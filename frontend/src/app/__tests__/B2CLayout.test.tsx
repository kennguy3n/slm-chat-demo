import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B2CLayout } from '../B2CLayout';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Channel } from '../../types/workspace';

const chats: Channel[] = [
  {
    id: 'ch_dm_alice_minh',
    workspaceId: 'ws_personal',
    name: 'Minh Nguyen',
    kind: 'dm',
    context: 'b2c',
    memberIds: ['user_alice', 'user_minh'],
    partnerLanguage: 'vi',
  },
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
    expect(screen.getByRole('button', { name: /minh nguyen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bob martinez/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /family group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neighborhood community/i })).toBeInTheDocument();
    // Wait for the (always-mounted) AIMemoryPage to finish its initial
    // async load so we don't trigger React's act() warning.
    await waitFor(() => expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument());
  });

  it('mounts only the new Summary / Memory / Stats right-rail tabs', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByTestId('b2c-right-tab-summary')).toBeInTheDocument();
    expect(screen.getByTestId('b2c-right-tab-memory')).toBeInTheDocument();
    expect(screen.getByTestId('b2c-right-tab-stats')).toBeInTheDocument();
    // Old tabs from the second-brain era must not render any more.
    expect(screen.queryByTestId('b2c-right-tab-family')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-shopping')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-events')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-trip')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-digest')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument(),
    );
  });

  it('mounts the conversation summary panel in the right rail', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByTestId('morning-digest-panel')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument(),
    );
  });

  it('auto-selects the bilingual ch_dm_alice_minh channel on first mount', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedChatId).toBe('ch_dm_alice_minh'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument(),
    );
  });

  it('keeps the user-selected chat when the layout remounts after a tab switch', async () => {
    useWorkspaceStore.setState({ selectedChatId: 'ch_family' });
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(useWorkspaceStore.getState().selectedChatId).toBe('ch_family');
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument(),
    );
    // Tab switch must not reset the selected chat.
    await userEvent.click(screen.getByTestId('b2c-right-tab-stats'));
    expect(useWorkspaceStore.getState().selectedChatId).toBe('ch_family');
  });
});
