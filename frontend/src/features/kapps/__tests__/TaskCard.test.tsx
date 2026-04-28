import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskCard } from '../TaskCard';
import type { Task } from '../../../types/kapps';

const baseTask: Task = {
  id: 'task_1',
  channelId: 'ch_family',
  sourceMessageId: 'msg_fam_1',
  title: 'Buy sunscreen for field trip',
  owner: 'user_alice',
  dueDate: '2026-05-01T00:00:00Z',
  status: 'open',
  aiGenerated: true,
};

describe('TaskCard', () => {
  it('renders title, owner, due date, status, and AI badge', () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByTestId('task-card')).toBeInTheDocument();
    expect(screen.getByText(baseTask.title)).toBeInTheDocument();
    expect(screen.getByText('user_alice')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('omits the AI badge when not AI-generated', () => {
    render(<TaskCard task={{ ...baseTask, aiGenerated: false }} />);
    expect(screen.queryByText('AI')).toBeNull();
  });

  it('shows "No due date" when due is missing', () => {
    render(<TaskCard task={{ ...baseTask, dueDate: undefined }} />);
    expect(screen.getByText('No due date')).toBeInTheDocument();
  });

  it('calls onOpenSource with the source id', async () => {
    const onOpenSource = vi.fn();
    render(<TaskCard task={baseTask} onOpenSource={onOpenSource} />);
    await userEvent.click(screen.getByRole('button', { name: /view source message/i }));
    expect(onOpenSource).toHaveBeenCalledWith('msg_fam_1');
  });

  it('renders status transition buttons when onStatusChange is provided', async () => {
    const onStatusChange = vi.fn();
    render(<TaskCard task={baseTask} onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByTestId('task-card-transition-in_progress'));
    expect(onStatusChange).toHaveBeenCalledWith('in_progress');
  });

  it('only offers Reopen from a done task', () => {
    render(
      <TaskCard
        task={{ ...baseTask, status: 'done' }}
        onStatusChange={() => {}}
      />,
    );
    expect(screen.getByTestId('task-card-transition-open')).toBeInTheDocument();
    expect(screen.queryByTestId('task-card-transition-in_progress')).toBeNull();
  });

  it('drives inline edit and emits a patch on save', async () => {
    const onEdit = vi.fn();
    render(<TaskCard task={baseTask} onEdit={onEdit} />);
    await userEvent.click(screen.getByTestId('task-card-edit-toggle'));
    const input = screen.getByTestId('task-card-edit-title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Reschedule field trip');
    await userEvent.click(screen.getByTestId('task-card-edit-save'));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reschedule field trip' }),
    );
  });

  it('hides actions and meta in compact mode', () => {
    render(
      <TaskCard
        task={baseTask}
        mode="compact"
        onStatusChange={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId('task-card')).toHaveAttribute('data-mode', 'compact');
    expect(screen.queryByTestId('task-card-transition-in_progress')).toBeNull();
    expect(screen.queryByTestId('task-card-edit-toggle')).toBeNull();
  });
});
