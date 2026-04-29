import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTaskForm } from '../CreateTaskForm';
import { useKAppsStore } from '../../../stores/kappsStore';

describe('CreateTaskForm', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
    useKAppsStore.setState({ tasksByChannel: {}, error: null, loading: false });
  });
  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('shows a validation error when title is empty', async () => {
    render(<CreateTaskForm channelId="ch_general" />);
    await userEvent.click(screen.getByTestId('create-task-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/title is required/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits a payload to /api/kapps/tasks and resets after success', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          task: {
            id: 't1',
            channelId: 'ch_general',
            title: 'Wire Ternary-Bonsai-8B',
            status: 'open',
            aiGenerated: false,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const onCreated = vi.fn();
    render(
      <CreateTaskForm
        channelId="ch_general"
        sourceThreadId="thr_x"
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByTestId('create-task-title'), 'Wire Ternary-Bonsai-8B');
    await userEvent.type(screen.getByTestId('create-task-owner'), 'user_alice');
    await userEvent.click(screen.getByTestId('create-task-submit'));

    await screen.findByTestId('create-task-form');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body ?? '{}') as string);
    expect(body).toEqual(
      expect.objectContaining({
        channelId: 'ch_general',
        title: 'Wire Ternary-Bonsai-8B',
        owner: 'user_alice',
        sourceThreadId: 'thr_x',
        aiGenerated: false,
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('surfaces API errors via the alert region', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(<CreateTaskForm channelId="ch_general" />);
    await userEvent.type(screen.getByTestId('create-task-title'), 'Will fail');
    await userEvent.click(screen.getByTestId('create-task-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom|400/);
  });
});
