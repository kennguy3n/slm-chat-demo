import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AIEmployeeList } from '../AIEmployeeList';
import type { AIEmployee } from '../../../types/aiEmployee';

const employees: AIEmployee[] = [
  {
    id: 'ai_kara_ops',
    name: 'Kara Ops AI',
    role: 'ops',
    avatarColor: '#0ea5e9',
    description: '',
    allowedChannelIds: [],
    recipes: [],
    budget: { maxTokensPerDay: 0, usedTokensToday: 0 },
    mode: 'inline',
    createdAt: '',
  },
  {
    id: 'ai_nina_pm',
    name: 'Nina PM AI',
    role: 'pm',
    avatarColor: '#7c3aed',
    description: '',
    allowedChannelIds: [],
    recipes: [],
    budget: { maxTokensPerDay: 0, usedTokensToday: 0 },
    mode: 'inline',
    createdAt: '',
  },
  {
    id: 'ai_mika_sales',
    name: 'Mika Sales AI',
    role: 'sales',
    avatarColor: '#16a34a',
    description: '',
    allowedChannelIds: [],
    recipes: [],
    budget: { maxTokensPerDay: 0, usedTokensToday: 0 },
    mode: 'inline',
    createdAt: '',
  },
];

describe('AIEmployeeList', () => {
  it('renders all three seeded AI Employees with role labels', () => {
    render(
      <AIEmployeeList employees={employees} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText('Kara Ops AI')).toBeInTheDocument();
    expect(screen.getByText('Nina PM AI')).toBeInTheDocument();
    expect(screen.getByText('Mika Sales AI')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked employee id', () => {
    const onSelect = vi.fn();
    render(
      <AIEmployeeList
        employees={employees}
        selectedId="ai_kara_ops"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('ai-employee-card-ai_nina_pm'));
    expect(onSelect).toHaveBeenCalledWith('ai_nina_pm');
  });

  it('marks the selected card as active', () => {
    render(
      <AIEmployeeList
        employees={employees}
        selectedId="ai_mika_sales"
        onSelect={() => {}}
      />,
    );
    expect(
      screen.getByTestId('ai-employee-card-ai_mika_sales').className,
    ).toMatch(/ai-employee-card--active/);
  });

  it('renders the Phase 4 mode badge next to each employee name', () => {
    const mixed: AIEmployee[] = [
      { ...employees[0], mode: 'auto' },
      { ...employees[1], mode: 'inline' },
      { ...employees[2], mode: 'auto' },
    ];
    render(
      <AIEmployeeList employees={mixed} selectedId={null} onSelect={() => {}} />,
    );
    const badges = screen.getAllByTestId('ai-employee-mode-badge');
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveAttribute('data-mode', 'auto');
    expect(badges[1]).toHaveAttribute('data-mode', 'inline');
    expect(badges[2]).toHaveAttribute('data-mode', 'auto');
  });
});
