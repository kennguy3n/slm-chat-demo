import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AIEmployeePanel } from '../AIEmployeePanel';
import { AI_EMPLOYEE_RECIPES } from '../recipeCatalog';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { AIEmployee } from '../../../types/aiEmployee';
import type { Channel } from '../../../types/workspace';

const channels: Channel[] = [
  {
    id: 'ch_general',
    name: 'general',
    kind: 'channel',
    context: 'b2b',
    workspaceId: 'ws_acme',
    domainId: 'dom_eng',
    memberIds: [],
  },
  {
    id: 'ch_engineering',
    name: 'engineering',
    kind: 'channel',
    context: 'b2b',
    workspaceId: 'ws_acme',
    domainId: 'dom_eng',
    memberIds: [],
  },
  {
    id: 'ch_vendor_management',
    name: 'vendor-management',
    kind: 'channel',
    context: 'b2b',
    workspaceId: 'ws_acme',
    domainId: 'dom_fin',
    memberIds: [],
  },
];

const kara: AIEmployee = {
  id: 'ai_kara_ops',
  name: 'Kara Ops AI',
  role: 'ops',
  avatarColor: '#0ea5e9',
  description: 'Ops copilot for vendor management.',
  allowedChannelIds: ['ch_general', 'ch_vendor_management'],
  recipes: ['summarize', 'extract_tasks'],
  budget: { maxTokensPerDay: 100000, usedTokensToday: 25000 },
  mode: 'inline',
  createdAt: '2026-04-29T09:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AIEmployeePanel', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('renders empty state when no employee is selected', () => {
    renderWithProviders(
      <AIEmployeePanel
        employee={null}
        channels={channels}
        recipeCatalog={AI_EMPLOYEE_RECIPES}
      />,
    );
    expect(
      screen.getByText(/select an ai employee/i),
    ).toBeInTheDocument();
  });

  it('renders profile, role, mode, channels, recipes and budget', () => {
    renderWithProviders(
      <AIEmployeePanel
        employee={kara}
        channels={channels}
        recipeCatalog={AI_EMPLOYEE_RECIPES}
      />,
    );
    expect(screen.getByText('Kara Ops AI')).toBeInTheDocument();
    expect(screen.getByTestId('ai-employee-panel-role')).toHaveTextContent(
      /operations/i,
    );
    expect(screen.getByTestId('ai-employee-panel-mode')).toHaveTextContent(
      /inline/i,
    );
    const chips = screen.getByTestId('ai-employee-panel-channels');
    expect(chips).toHaveTextContent('general');
    expect(chips).toHaveTextContent('vendor-management');
    const recipes = screen.getByTestId('ai-employee-panel-recipes');
    expect(recipes).toHaveTextContent(/summarize thread/i);
    expect(recipes).toHaveTextContent(/extract tasks/i);
    expect(screen.getByTestId('ai-employee-panel-budget')).toHaveTextContent(
      /25,?000.+100,?000/,
    );
  });

  it('configures channels and saves via PATCH with optimistic update', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        aiEmployee: {
          ...kara,
          allowedChannelIds: ['ch_general', 'ch_engineering'],
        },
      }),
    );
    const onChange = vi.fn();
    renderWithProviders(
      <AIEmployeePanel
        employee={kara}
        channels={channels}
        recipeCatalog={AI_EMPLOYEE_RECIPES}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('ai-employee-panel-configure-channels'));
    expect(screen.getByTestId('ai-employee-panel-channel-picker')).toBeInTheDocument();

    // Uncheck vendor-management, check engineering.
    fireEvent.click(screen.getByTestId('ai-employee-panel-channel-ch_vendor_management'));
    fireEvent.click(screen.getByTestId('ai-employee-panel-channel-ch_engineering'));

    fireEvent.click(screen.getByTestId('ai-employee-panel-save-channels'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('/api/ai-employees/ai_kara_ops/channels');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(String(init.body));
    expect(new Set(body.channelIds)).toEqual(
      new Set(['ch_general', 'ch_engineering']),
    );
    // onChange gets called twice: once optimistically, once with the server response.
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0].allowedChannelIds).toEqual([
      'ch_general',
      'ch_engineering',
    ]);
  });
});
