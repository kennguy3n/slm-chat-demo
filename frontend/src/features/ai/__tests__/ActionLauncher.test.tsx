import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionLauncher } from '../ActionLauncher';

describe('ActionLauncher', () => {
  it('shows the four B2C quick actions', async () => {
    render(<ActionLauncher context="b2c" />);
    await userEvent.click(screen.getByTestId('action-launcher-trigger'));
    expect(screen.getByText('Catch me up')).toBeInTheDocument();
    expect(screen.getByText('Translate')).toBeInTheDocument();
    expect(screen.getByText('Remind me')).toBeInTheDocument();
    expect(screen.getByText('Extract tasks')).toBeInTheDocument();
    // None of the B2B intents leak into the B2C menu.
    expect(screen.queryByText('Analyze')).toBeNull();
  });

  it('shows the four B2B core intents', async () => {
    render(<ActionLauncher context="b2b" />);
    await userEvent.click(screen.getByTestId('action-launcher-trigger'));
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Analyze')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.queryByText('Catch me up')).toBeNull();
  });

  it('opens a submenu in B2B mode and fires onAction with the path', async () => {
    const onAction = vi.fn();
    render(<ActionLauncher context="b2b" onAction={onAction} />);
    await userEvent.click(screen.getByTestId('action-launcher-trigger'));
    await userEvent.click(screen.getByTestId('action-launcher-item-create'));
    // Submenu should have rendered.
    expect(screen.getByTestId('action-launcher-submenu-create')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('action-launcher-item-create-prd'));
    expect(onAction).toHaveBeenCalledWith(['create', 'prd']);
    expect(screen.getByTestId('action-launcher-toast')).toHaveTextContent(/queued create/i);
  });

  it('fires onAction with a single-element path for B2C quick actions', async () => {
    const onAction = vi.fn();
    render(<ActionLauncher context="b2c" onAction={onAction} />);
    await userEvent.click(screen.getByTestId('action-launcher-trigger'));
    await userEvent.click(screen.getByTestId('action-launcher-item-translate'));
    expect(onAction).toHaveBeenCalledWith(['translate']);
  });
});
