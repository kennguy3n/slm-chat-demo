import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../AppShell';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderWithProviders } from '../../test/renderWithProviders';

// TopBar uses TanStack Router's useNavigate to keep the URL in sync with the
// context toggle. In isolation tests we don't mount the real router; instead
// we stub useNavigate to update the store directly so the click still flips
// the visible layout.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => (opts: { to: string }) => {
    const ctx = opts.to === '/b2b' ? 'b2b' : 'b2c';
    useWorkspaceStore.getState().setContext(ctx);
  },
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setupFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/api/users/me')) {
      return jsonResponse({
        id: 'user_alice',
        displayName: 'Alice Chen',
        email: 'a@x',
        avatarColor: '#7c3aed',
      });
    }
    if (url.endsWith('/api/users')) {
      return jsonResponse({
        users: [
          { id: 'user_alice', displayName: 'Alice Chen', email: 'a@x', avatarColor: '#7c3aed' },
          { id: 'user_bob', displayName: 'Bob Martinez', email: 'b@x', avatarColor: '#0ea5e9' },
        ],
      });
    }
    if (url.endsWith('/api/workspaces')) {
      return jsonResponse({
        workspaces: [
          { id: 'ws_personal', name: 'Personal', context: 'b2c', domains: [{ id: 'd', name: 'Personal' }] },
          { id: 'ws_acme', name: 'Acme Corp', context: 'b2b', domains: [{ id: 'dom_eng', name: 'Engineering' }] },
        ],
      });
    }
    if (url.includes('/api/chats?context=b2c') || url.endsWith('/api/chats')) {
      return jsonResponse({
        chats: [
          {
            id: 'ch_family',
            workspaceId: 'ws_personal',
            name: 'Family Group',
            kind: 'family',
            context: 'b2c',
            memberIds: ['user_alice'],
          },
        ],
      });
    }
    if (url.includes('/api/chats?context=b2b')) {
      return jsonResponse({ chats: [] });
    }
    if (url.includes('/api/workspaces/ws_personal/channels')) {
      return jsonResponse({ channels: [] });
    }
    if (url.includes('/api/workspaces/ws_acme/channels')) {
      return jsonResponse({
        channels: [
          {
            id: 'ch_general',
            workspaceId: 'ws_acme',
            domainId: 'dom_eng',
            name: 'general',
            kind: 'channel',
            context: 'b2b',
            memberIds: ['user_alice'],
          },
        ],
      });
    }
    if (url.includes('/messages')) return jsonResponse({ messages: [] });
    return jsonResponse({});
  });
}

describe('AppShell', () => {
  let fetchSpy: ReturnType<typeof setupFetch>;
  beforeEach(() => {
    useWorkspaceStore.setState({
      context: 'b2c',
      workspaceId: null,
      selectedChatId: null,
      selectedThreadId: null,
    });
    fetchSpy = setupFetch();
  });
  afterEach(() => fetchSpy.mockReset());

  it('renders the B2C layout by default', async () => {
    renderWithProviders(<AppShell />);
    await waitFor(() => {
      expect(screen.getByTestId('b2c-layout')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('b2b-layout')).toBeNull();
  });

  it('switches to the B2B layout when the mode button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);
    await waitFor(() => screen.getByTestId('b2c-layout'));
    await user.click(screen.getByRole('button', { name: /switch to b2b context/i }));
    await waitFor(() => {
      expect(screen.getByTestId('b2b-layout')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('b2c-layout')).toBeNull();
  });
});
