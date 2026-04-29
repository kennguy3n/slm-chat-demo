import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { QueueView } from '../QueueView';
import { AI_EMPLOYEE_RECIPES } from '../recipeCatalog';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { RecipeRun } from '../../../types/aiEmployee';
import type { Channel } from '../../../types/workspace';

const channels: Channel[] = [
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
    id: 'ch_product',
    name: 'product',
    kind: 'channel',
    context: 'b2b',
    workspaceId: 'ws_acme',
    domainId: 'dom_eng',
    memberIds: [],
  },
];

const runs: RecipeRun[] = [
  {
    id: 'rr_1',
    aiEmployeeId: 'ai_kara_ops',
    recipeId: 'summarize',
    channelId: 'ch_engineering',
    threadId: 'thr_abc',
    status: 'pending',
    createdAt: '2026-04-29T09:00:00Z',
  },
  {
    id: 'rr_2',
    aiEmployeeId: 'ai_kara_ops',
    recipeId: 'extract_tasks',
    channelId: 'ch_product',
    threadId: 'thr_def',
    status: 'completed',
    createdAt: '2026-04-29T08:55:00Z',
    completedAt: '2026-04-29T08:56:00Z',
    resultSummary: 'Extracted 4 tasks',
  },
  {
    id: 'rr_3',
    aiEmployeeId: 'ai_nina_pm',
    recipeId: 'draft_prd',
    channelId: 'ch_product',
    status: 'pending',
    createdAt: '2026-04-29T08:45:00Z',
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('QueueView', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('renders pending and completed recipe runs', () => {
    renderWithProviders(
      <QueueView
        aiEmployeeId="ai_kara_ops"
        channels={channels}
        recipeCatalog={AI_EMPLOYEE_RECIPES}
        initialRuns={runs.filter((r) => r.aiEmployeeId === 'ai_kara_ops')}
      />,
    );
    const list = screen.getByTestId('queue-view-list');
    expect(list).toHaveTextContent(/summarize thread/i);
    expect(list).toHaveTextContent(/extract tasks/i);
    expect(screen.getByTestId('queue-view-status-rr_1')).toHaveTextContent(/pending/i);
    expect(screen.getByTestId('queue-view-status-rr_2')).toHaveTextContent(/completed/i);
    // Channel name is rendered for each row.
    expect(list).toHaveTextContent('engineering');
    expect(list).toHaveTextContent('product');
    // Completed runs surface their summary.
    expect(list).toHaveTextContent('Extracted 4 tasks');
  });

  it('renders an empty state when the queue has no runs', () => {
    renderWithProviders(
      <QueueView
        aiEmployeeId="ai_kara_ops"
        channels={channels}
        recipeCatalog={AI_EMPLOYEE_RECIPES}
        initialRuns={[]}
      />,
    );
    expect(screen.getByTestId('queue-view-empty')).toHaveTextContent(
      /no pending tasks/i,
    );
    expect(screen.queryByTestId('queue-view-list')).not.toBeInTheDocument();
  });

  it('fetches and filters runs by AI Employee when no initialRuns are provided', async () => {
    // Backend already filters server-side; the hook hits the employee-
    // scoped URL so only that employee's runs come back.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        recipeRuns: runs.filter((r) => r.aiEmployeeId === 'ai_nina_pm'),
      }),
    );
    renderWithProviders(
      <QueueView
        aiEmployeeId="ai_nina_pm"
        channels={channels}
        recipeCatalog={AI_EMPLOYEE_RECIPES}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('queue-view-list')).toBeInTheDocument();
    });
    const list = screen.getByTestId('queue-view-list');
    expect(list).toHaveTextContent(/draft prd/i);
    // Kara's runs must not leak into Nina's queue.
    expect(list).not.toHaveTextContent(/summarize thread/i);
    expect(list).not.toHaveTextContent(/extract tasks/i);

    // URL encodes the AI Employee id so backend filtering matches.
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('/api/ai-employees/ai_nina_pm/queue');
  });
});
