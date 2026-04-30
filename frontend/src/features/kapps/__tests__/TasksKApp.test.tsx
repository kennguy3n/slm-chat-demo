import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksKApp } from '../TasksKApp';
import { useKAppsStore } from '../../../stores/kappsStore';
import type { Task } from '../../../types/kapps';

const tasks: Task[] = [
  {
    id: 'task_a',
    channelId: 'ch_general',
    title: 'Wire Bonsai-1.7B routing',
    owner: 'user_alice',
    dueDate: '2026-05-10T00:00:00Z',
    status: 'open',
    aiGenerated: false,
  },
  {
    id: 'task_b',
    channelId: 'ch_general',
    title: 'Approve vendor renewal',
    owner: 'user_dave',
    dueDate: '2026-05-01T00:00:00Z',
    status: 'in_progress',
    aiGenerated: true,
  },
  {
    id: 'task_c',
    channelId: 'ch_general',
    title: 'Old task',
    status: 'done',
    aiGenerated: false,
  },
];

describe('TasksKApp', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ tasks }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    act(() => {
      useKAppsStore.setState({ tasksByChannel: {}, error: null, loading: false });
    });
  });
  afterEach(() => fetchSpy.mockReset());

  it('renders an empty hint when no channel is selected', () => {
    render(<TasksKApp channelId={null} />);
    expect(screen.getByText(/select a channel/i)).toBeInTheDocument();
  });

  it('fetches tasks for the channel and sorts by due date', async () => {
    render(<TasksKApp channelId="ch_general" />);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/kapps/tasks?channelId=ch_general'),
        expect.anything(),
      ),
    );
    const titles = await screen.findAllByRole('heading', { level: 4 });
    // Earliest due date first.
    expect(titles[0]).toHaveTextContent('Approve vendor renewal');
  });

  it('filters tasks by status', async () => {
    render(<TasksKApp channelId="ch_general" />);
    await screen.findByText('Wire Bonsai-1.7B routing');
    await userEvent.click(screen.getByTestId('tasks-kapp-filter-done'));
    expect(screen.getByText('Old task')).toBeInTheDocument();
    expect(screen.queryByText('Wire Bonsai-1.7B routing')).toBeNull();
  });

  it('toggles the create form', async () => {
    render(<TasksKApp channelId="ch_general" />);
    await screen.findByText('Wire Bonsai-1.7B routing');
    await userEvent.click(screen.getByTestId('tasks-kapp-new-toggle'));
    expect(screen.getByTestId('tasks-kapp-create-form')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('tasks-kapp-new-toggle'));
    expect(screen.queryByTestId('tasks-kapp-create-form')).toBeNull();
  });
});
