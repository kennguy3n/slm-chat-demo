import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TripPlannerCard } from '../TripPlannerCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { createInMemoryStore } from '../../memory/memoryStore';
import { buildFact } from '../../memory/memoryStore';
import type { TripPlannerExecution } from '../../../types/electron';

function fakeOk(destination = 'Tokyo'): TripPlannerExecution {
  return {
    weather: [{ date: '2026-05-01', summary: 'Sunny' }],
    events: [
      {
        id: 'evt_demo',
        title: 'Spring festival',
        date: '2026-05-01',
        source: 'mock-events',
      },
    ],
    attractions: [
      {
        id: 'attr_demo',
        name: 'Sky Tower',
        category: 'sightseeing',
        description: 'A tall tower.',
        source: 'mock-attractions',
      },
    ],
    prompt: 'prompt body',
    result: {
      status: 'ok',
      skillId: 'trip-planner',
      result: {
        destination,
        durationDays: 2,
        summary: `2-day plan for ${destination}.`,
        days: [
          {
            day: 1,
            weatherNote: 'Sunny',
            items: [
              {
                title: 'Sky Tower',
                detail: 'A tall tower.',
                sourceLabel: 'attraction',
                sourceId: 'attr_demo',
              },
            ],
          },
          {
            day: 2,
            items: [
              {
                title: 'Spring festival',
                detail: 'on 2026-05-02',
                sourceLabel: 'event',
                sourceId: 'evt_demo',
              },
            ],
          },
        ],
        weatherSources: ['mock-weather'],
        eventSources: ['mock-events'],
        attractionSources: ['mock-attractions'],
        memorySources: [],
      },
      sources: [
        { kind: 'tool', id: 'mock-events', label: 'events' },
      ],
      confidence: 0.9,
      rawOutput: 'raw',
      privacy: {
        computeLocation: 'on_device',
        modelName: 'ternary-bonsai-8b',
        tier: 'e4b',
        reason: 'Routed trip planner to E4B for itinerary.',
        dataEgressBytes: 0,
        sources: [{ kind: 'tool', id: 'mock-events', label: 'events' }],
      },
    },
  };
}

describe('TripPlannerCard', () => {
  it('renders the input form and disables run when destination is empty', async () => {
    const runTripPlan = vi.fn();
    renderWithProviders(<TripPlannerCard runTripPlan={runTripPlan} />);
    expect(screen.getByTestId('trip-planner-card')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('trip-planner-run'));
    expect(runTripPlan).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Add a destination');
  });

  it('shows AI Memory context after loading facts', async () => {
    const store = createInMemoryStore();
    await store.put(buildFact({ id: 'l', kind: 'location', text: 'Brooklyn, NY' }));
    await store.put(buildFact({ id: 'm1', kind: 'member', text: 'Mom' }));
    await store.put(buildFact({ id: 'm2', kind: 'member', text: 'Dad' }));
    renderWithProviders(<TripPlannerCard store={store} runTripPlan={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('trip-planner-context')).toHaveTextContent('Brooklyn, NY'),
    );
    expect(screen.getByTestId('trip-planner-context')).toHaveTextContent('2 members');
  });

  it('renders the itinerary days after a successful plan', async () => {
    const runTripPlan = vi.fn().mockResolvedValue(fakeOk('Tokyo'));
    renderWithProviders(<TripPlannerCard runTripPlan={runTripPlan} />);
    await userEvent.type(screen.getByTestId('trip-planner-destination'), 'Tokyo');
    await userEvent.click(screen.getByTestId('trip-planner-run'));
    await waitFor(() =>
      expect(screen.getByTestId('trip-planner-days-list')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('trip-planner-summary')).toHaveTextContent('2-day plan for Tokyo');
    expect(screen.getByText('Sky Tower')).toBeInTheDocument();
    expect(screen.getByText('Spring festival')).toBeInTheDocument();
    expect(runTripPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ destination: 'Tokyo' }),
      }),
    );
  });

  it('renders the refusal text when the skill returns refused', async () => {
    const runTripPlan = vi.fn().mockResolvedValue({
      weather: [],
      events: [],
      attractions: [],
      prompt: '',
      result: {
        status: 'refused',
        skillId: 'trip-planner',
        refusal: {
          reason: 'duration must be a positive integer',
          origin: 'pre_inference',
          refusalText: "I can't draft a trip itinerary — duration must be a positive integer.",
        },
        privacy: null,
      },
    });
    renderWithProviders(<TripPlannerCard runTripPlan={runTripPlan} />);
    await userEvent.type(screen.getByTestId('trip-planner-destination'), 'Tokyo');
    await userEvent.click(screen.getByTestId('trip-planner-run'));
    await waitFor(() =>
      expect(screen.getByTestId('trip-planner-refusal')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('trip-planner-refusal')).toHaveTextContent('duration must be');
  });
});
