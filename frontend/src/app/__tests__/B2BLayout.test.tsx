import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { B2BLayout } from '../B2BLayout';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Channel, Workspace } from '../../types/workspace';

const acme: Workspace = {
  id: 'ws_acme',
  name: 'Acme Corp',
  context: 'b2b',
  domains: [
    { id: 'dom_eng', name: 'Engineering' },
    { id: 'dom_fin', name: 'Finance' },
  ],
};

const channels: Channel[] = [
  {
    id: 'ch_general',
    workspaceId: 'ws_acme',
    domainId: 'dom_eng',
    name: 'general',
    kind: 'channel',
    context: 'b2b',
    memberIds: ['user_alice'],
  },
  {
    id: 'ch_engineering',
    workspaceId: 'ws_acme',
    domainId: 'dom_eng',
    name: 'engineering',
    kind: 'channel',
    context: 'b2b',
    memberIds: ['user_alice'],
  },
  {
    id: 'ch_vendor_management',
    workspaceId: 'ws_acme',
    domainId: 'dom_fin',
    name: 'vendor-management',
    kind: 'channel',
    context: 'b2b',
    memberIds: ['user_alice'],
  },
];

describe('B2BLayout', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    useWorkspaceStore.setState({
      context: 'b2b',
      workspaceId: 'ws_acme',
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

  it('renders the workspace name, both domains, and their channels', () => {
    renderWithProviders(<B2BLayout workspace={acme} channels={channels} users={{}} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /# general/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /# engineering/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /# vendor-management/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /direct messages/i })).toBeInTheDocument();
  });
});
