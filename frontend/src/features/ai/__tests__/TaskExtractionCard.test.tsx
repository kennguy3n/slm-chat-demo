import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskExtractionCard, type TaskItem } from '../TaskExtractionCard';
import { renderWithProviders } from '../../../test/renderWithProviders';

const b2cTasks: TaskItem[] = [
  { title: 'Sign field trip form', dueDate: 'Friday', type: 'task' },
  { title: 'Buy sunscreen', type: 'shopping' },
];

const b2bTasks: TaskItem[] = [
  {
    title: 'Pull pricing breakdown for Acme bid',
    owner: 'user_dave',
    dueDate: 'EOD',
    status: 'open',
    sourceMessageId: 'msg_vend_r4',
  },
  {
    title: 'Approve vendor selection',
    owner: 'user_eve',
    status: 'open',
    sourceMessageId: 'msg_vend_r3',
  },
];

describe('TaskExtractionCard', () => {
  it('renders an inline AI badge with the item count', () => {
    renderWithProviders(
      <TaskExtractionCard
        tasks={b2cTasks}
        sourceMessageId="msg_fam_1"
        channelId="ch_family"
        model="gemma-4-e2b"
        computeLocation="on_device"
        dataEgressBytes={0}
      />,
    );
    const badge = screen.getByTestId('task-extraction-badge');
    expect(badge).toHaveTextContent(/2 items extracted/i);
  });

  it('expands to show each proposed task with Accept / Discard buttons', async () => {
    renderWithProviders(
      <TaskExtractionCard
        tasks={b2cTasks}
        sourceMessageId="msg_fam_1"
        channelId="ch_family"
        model="gemma-4-e2b"
        computeLocation="on_device"
        dataEgressBytes={0}
      />,
    );
    await userEvent.click(screen.getByTestId('task-extraction-badge'));
    expect(screen.getByTestId('task-extraction-list')).toBeInTheDocument();
    expect(screen.getByTestId('task-extraction-accept-0')).toBeInTheDocument();
    expect(screen.getByTestId('task-extraction-discard-0')).toBeInTheDocument();
  });

  it('fires onAccept and removes the task from the list', async () => {
    const onAccept = vi.fn();
    renderWithProviders(
      <TaskExtractionCard
        tasks={b2cTasks}
        sourceMessageId="msg_fam_1"
        channelId="ch_family"
        model="gemma-4-e2b"
        computeLocation="on_device"
        dataEgressBytes={0}
        onAccept={onAccept}
      />,
    );
    await userEvent.click(screen.getByTestId('task-extraction-badge'));
    await userEvent.click(screen.getByTestId('task-extraction-accept-0'));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept.mock.calls[0][0].title).toBe('Sign field trip form');
    expect(screen.getByTestId('task-extraction-badge')).toHaveTextContent(/1 item extracted/i);
  });

  it('passes the edited title to onAccept when the user edits the input', async () => {
    const onAccept = vi.fn();
    renderWithProviders(
      <TaskExtractionCard
        tasks={b2cTasks}
        sourceMessageId="msg_fam_1"
        channelId="ch_family"
        model="gemma-4-e2b"
        computeLocation="on_device"
        dataEgressBytes={0}
        onAccept={onAccept}
      />,
    );
    await userEvent.click(screen.getByTestId('task-extraction-badge'));
    const input = screen.getByTestId('task-extraction-input-0');
    await userEvent.clear(input);
    await userEvent.type(input, 'Sign permission slip tonight');
    await userEvent.click(screen.getByTestId('task-extraction-accept-0'));
    expect(onAccept.mock.calls[0][0].title).toBe('Sign permission slip tonight');
  });

  it('renders B2B owner and status fields when present', async () => {
    renderWithProviders(
      <TaskExtractionCard
        tasks={b2bTasks}
        sourceMessageId="msg_vend_root"
        channelId="ch_vendor_management"
        model="gemma-4-e2b"
        computeLocation="on_device"
        dataEgressBytes={0}
        acceptLabel="Add to plan"
      />,
    );
    await userEvent.click(screen.getByTestId('task-extraction-badge'));
    const list = screen.getByTestId('task-extraction-list');
    expect(list).toHaveTextContent('user_dave');
    expect(list).toHaveTextContent('open');
    expect(screen.getByTestId('task-extraction-accept-0')).toHaveTextContent(/add to plan/i);
  });

  it('renders the privacy strip with on-device / 0 egress', () => {
    renderWithProviders(
      <TaskExtractionCard
        tasks={b2cTasks}
        sourceMessageId="msg_fam_1"
        channelId="ch_family"
        model="gemma-4-e2b"
        computeLocation="on_device"
        dataEgressBytes={0}
      />,
    );
    expect(screen.getByTestId('privacy-compute')).toHaveTextContent('On-device');
    expect(screen.getByTestId('privacy-egress')).toHaveTextContent('0 B');
  });
});
