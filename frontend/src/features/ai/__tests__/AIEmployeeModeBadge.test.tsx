import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIEmployeeModeBadge } from '../AIEmployeeModeBadge';

describe('AIEmployeeModeBadge', () => {
  it('renders the auto variant with name and data-mode="auto"', () => {
    render(<AIEmployeeModeBadge mode="auto" employeeName="Kara Ops AI" />);
    const badge = screen.getByTestId('ai-employee-mode-badge');
    expect(badge).toHaveAttribute('data-mode', 'auto');
    expect(badge).toHaveAttribute(
      'aria-label',
      'Auto mode · Kara Ops AI',
    );
    expect(screen.getByTestId('ai-employee-mode-badge-auto')).toHaveTextContent(
      /Auto · Kara Ops AI/,
    );
    expect(badge.className).toContain('ai-employee-mode-badge--auto');
  });

  it('renders the inline variant with name and data-mode="inline"', () => {
    render(<AIEmployeeModeBadge mode="inline" employeeName="Nina PM AI" />);
    const badge = screen.getByTestId('ai-employee-mode-badge');
    expect(badge).toHaveAttribute('data-mode', 'inline');
    expect(badge).toHaveAttribute(
      'aria-label',
      'Inline mode · Nina PM AI',
    );
    expect(screen.getByTestId('ai-employee-mode-badge-inline')).toHaveTextContent(
      /Inline · Nina PM AI/,
    );
    expect(badge.className).toContain('ai-employee-mode-badge--inline');
  });

  it('accepts a size prop for the md variant', () => {
    render(
      <AIEmployeeModeBadge
        mode="auto"
        employeeName="Mika Sales AI"
        size="md"
      />,
    );
    const badge = screen.getByTestId('ai-employee-mode-badge');
    expect(badge.className).toContain('ai-employee-mode-badge--md');
  });
});
