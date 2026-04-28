import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../AppShell';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderWithProviders } from '../../test/renderWithProviders';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
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
      return jsonResponse({ id: 'u', displayName: 'U', email: 'u', avatarColor: '#000' });
    }
    if (url.endsWith('/api/users')) return jsonResponse({ users: [] });
    if (url.endsWith('/api/workspaces')) {
      return jsonResponse({
        workspaces: [
          { id: 'ws_personal', name: 'Personal', context: 'b2c', domains: [{ id: 'd', name: 'Personal' }] },
        ],
      });
    }
    if (url.includes('/api/chats')) return jsonResponse({ chats: [] });
    if (url.includes('/channels')) return jsonResponse({ channels: [] });
    if (url.includes('/messages')) return jsonResponse({ messages: [] });
    if (url.includes('/api/kapps/cards')) return jsonResponse({ cards: [] });
    return jsonResponse({});
  });
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('AppShell mobile responsive', () => {
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

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('renders the desktop layout when matchMedia reports >768px', async () => {
    mockMatchMedia(false);
    renderWithProviders(<AppShell />);
    await waitFor(() => screen.getByTestId('b2c-layout'));
    expect(screen.queryByTestId('mobile-tabbar')).toBeNull();
    expect(screen.getByTestId('app-shell').getAttribute('data-mobile')).toBe('false');
  });

  it('renders the MobileTabBar and switches tabs when matchMedia matches', async () => {
    mockMatchMedia(true);
    renderWithProviders(<AppShell />);
    await waitFor(() => screen.getByTestId('mobile-tabbar'));
    expect(screen.getByTestId('app-shell').getAttribute('data-mobile')).toBe('true');
    // Default tab is Message — desktop layout still mounts so the chat list
    // renders full-width (CSS hides the right panel and toggles main vs sidebar).
    expect(screen.getByTestId('b2c-layout')).toBeInTheDocument();

    // Tapping a different tab swaps in the mobile placeholder.
    await userEvent.click(screen.getByTestId('mobile-tab-tasks'));
    expect(screen.getByTestId('mobile-placeholder-tasks')).toBeInTheDocument();
    expect(screen.queryByTestId('b2c-layout')).toBeNull();
  });
});
