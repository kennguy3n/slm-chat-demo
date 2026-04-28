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
});
