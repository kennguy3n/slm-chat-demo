import { afterEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { MetricsDashboard } from '../MetricsDashboard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { __resetActivityForTesting, logActivity, type ActivityEntry } from '../activityLog';

afterEach(() => {
  __resetActivityForTesting();
});

const sample: ActivityEntry[] = [
  {
    id: 'a1',
    timestamp: '2026-04-28T10:00:00.000Z',
    skillId: 'family-checklist',
    model: 'bonsai-8b',
    tier: 'local',
    itemsProduced: 3,
    egressBytes: 0,
    latencyMs: 25,
  },
  {
    id: 'a2',
    timestamp: '2026-04-28T10:05:00.000Z',
    skillId: 'trip-planner',
    model: 'bonsai-8b-alt',
    tier: 'local',
    itemsProduced: 4,
    egressBytes: 0,
    latencyMs: 80,
  },
];

describe('MetricsDashboard', () => {
  it('renders counts, models, and the on-device assurance line', () => {
    renderWithProviders(<MetricsDashboard initial={sample} />);
    expect(screen.getByTestId('metrics-runs')).toHaveTextContent('2');
    expect(screen.getByTestId('metrics-items')).toHaveTextContent('7');
    expect(screen.getByTestId('metrics-egress')).toHaveTextContent('0 B');
    expect(screen.getByTestId('metrics-time-saved')).toHaveTextContent('3m 30s');
    expect(screen.getByTestId('metrics-models')).toHaveTextContent('bonsai-8b');
    expect(screen.getByTestId('metrics-models')).toHaveTextContent('bonsai-8b-alt');
    expect(screen.getByTestId('metrics-assurance')).toHaveTextContent('All AI ran on-device');
  });

  it('updates live when a new activity entry is logged', () => {
    renderWithProviders(<MetricsDashboard />);
    expect(screen.getByTestId('metrics-runs')).toHaveTextContent('0');
    act(() => {
      logActivity({
        skillId: 'family-checklist',
        model: 'bonsai-8b',
        tier: 'local',
        itemsProduced: 2,
        egressBytes: 0,
        latencyMs: 18,
      });
    });
    expect(screen.getByTestId('metrics-runs')).toHaveTextContent('1');
    expect(screen.getByTestId('metrics-items')).toHaveTextContent('2');
  });
});
