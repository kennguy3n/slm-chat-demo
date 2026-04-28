import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskCreatedPill } from '../TaskCreatedPill';

describe('TaskCreatedPill', () => {
  it('renders nothing when count is zero', () => {
    const { container } = render(<TaskCreatedPill count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders singular text for count 1', () => {
    render(<TaskCreatedPill count={1} />);
    expect(screen.getByTestId('task-created-pill')).toHaveTextContent('1 task created');
  });

  it('renders plural text for count > 1', () => {
    render(<TaskCreatedPill count={3} />);
    expect(screen.getByTestId('task-created-pill')).toHaveTextContent('3 tasks created');
  });

  it('appends the source-message label when provided', () => {
    render(<TaskCreatedPill count={2} label="field-trip form Friday" />);
    const pill = screen.getByTestId('task-created-pill');
    expect(pill).toHaveTextContent('field-trip form Friday');
    expect(pill).toHaveAccessibleName(/2 tasks created from "field-trip form Friday"/i);
  });

  it('respects custom testId', () => {
    render(<TaskCreatedPill count={2} testId="task-created-pill-msg-1" />);
    expect(screen.getByTestId('task-created-pill-msg-1')).toBeInTheDocument();
  });

  it('fires onClick when activated', async () => {
    const onClick = vi.fn();
    render(<TaskCreatedPill count={2} onClick={onClick} />);
    await userEvent.click(screen.getByTestId('task-created-pill'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
