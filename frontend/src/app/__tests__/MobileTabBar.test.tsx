import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileTabBar } from '../MobileTabBar';

describe('MobileTabBar', () => {
  it('renders all five required tabs', () => {
    render(<MobileTabBar active="message" onSelect={() => {}} />);
    expect(screen.getByTestId('mobile-tabbar')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-tab-message')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-tab-notification')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-tab-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-tab-settings')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-tab-more')).toBeInTheDocument();
  });

  it('marks the active tab with aria-current', () => {
    render(<MobileTabBar active="tasks" onSelect={() => {}} />);
    expect(screen.getByTestId('mobile-tab-tasks')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('mobile-tab-message')).not.toHaveAttribute('aria-current');
  });

  it('fires onSelect with the tapped tab id', async () => {
    const onSelect = vi.fn();
    render(<MobileTabBar active="message" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('mobile-tab-settings'));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });
});
