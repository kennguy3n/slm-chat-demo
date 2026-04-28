import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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

  it('renders sidebar sections for personal, family, and community chats', () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByRole('heading', { name: /personal chats/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /family groups/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /community groups/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bob martinez/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /family group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neighborhood community/i })).toBeInTheDocument();
  });

  it('shows the right-panel placeholder', () => {
    renderWithProviders(<B2CLayout chats={chats} users={{}} />);
    expect(screen.getByText(/select a thread/i)).toBeInTheDocument();
  });
});
