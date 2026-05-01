import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { B2CLayout } from '../B2CLayout';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Channel } from '../../types/workspace';

// The 2026-05-01 ground-zero LLM redesign collapsed B2C to a single
// bilingual VI↔EN DM. The layout still renders any DM-kind channel
// the seed exposes, so we ship a small fixture with two of them to
// confirm the sidebar renders multiple personal chats correctly.
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
    id: 'ch_dm_alice_friend',
    workspaceId: 'ws_personal',
    name: 'Friend',
    kind: 'dm',
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

  it('renders the personal-chats sidebar section with all DM channels', () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByRole('heading', { name: /personal chats/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /minh nguyen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^friend$/i })).toBeInTheDocument();
    // Family / community sidebar sections were removed by the
    // ground-zero LLM redesign.
    expect(screen.queryByRole('heading', { name: /family groups/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /community groups/i })).toBeNull();
  });

  it('mounts only the Summary / Insights / Stats right-rail tabs', () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByTestId('b2c-right-tab-summary')).toBeInTheDocument();
    expect(screen.getByTestId('b2c-right-tab-insights')).toBeInTheDocument();
    expect(screen.getByTestId('b2c-right-tab-stats')).toBeInTheDocument();
    // Old tabs from the second-brain / memory era must not render.
    expect(screen.queryByTestId('b2c-right-tab-memory')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-family')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-shopping')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-events')).toBeNull();
    expect(screen.queryByTestId('b2c-right-tab-trip')).toBeNull();
  });

  it('mounts the conversation summary panel in the right rail', () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByTestId('morning-digest-panel')).toBeInTheDocument();
  });

  it('mounts the LLM-driven conversation insights panel', () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByTestId('conversation-insights-panel')).toBeInTheDocument();
  });

  it('auto-selects the bilingual ch_dm_alice_minh channel on first mount', async () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedChatId).toBe('ch_dm_alice_minh'),
    );
  });

  it('keeps the user-selected chat when the user switches right-rail tabs', async () => {
    useWorkspaceStore.setState({ selectedChatId: 'ch_dm_alice_friend' });
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(useWorkspaceStore.getState().selectedChatId).toBe('ch_dm_alice_friend');
    await userEvent.click(screen.getByTestId('b2c-right-tab-stats'));
    expect(useWorkspaceStore.getState().selectedChatId).toBe('ch_dm_alice_friend');
  });
});
