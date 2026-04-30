import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventRSVPCard } from '../EventRSVPCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import * as aiApi from '../../../api/aiApi';
import type { EventRSVPResponse } from '../../../types/ai';

const fakeResp: EventRSVPResponse = {
  channelId: 'ch_comm',
  events: [
    {
      title: 'PTA potluck',
      whenHint: 'Saturday 3pm',
      location: 'School gym',
      rsvpBy: 'Friday',
      sourceMessageId: 'm1',
    },
    {
      title: 'Soccer parents meeting',
      whenHint: 'Tuesday 7pm',
      sourceMessageId: 'm2',
    },
  ],
  sourceMessageIds: ['m1', 'm2'],
  model: 'bonsai-8b',
  tier: 'local',
  reason: 'Routed RSVP extraction to on-device Bonsai-8B.',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('EventRSVPCard', () => {
  beforeEach(() => {
    vi.spyOn(aiApi, 'fetchEventRSVP').mockResolvedValue(fakeResp);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the run button when no chat is selected', () => {
    renderWithProviders(<EventRSVPCard channelId={null} />);
    expect(screen.getByTestId('event-rsvp-run')).toBeDisabled();
  });

  it('lists events with their structured metadata', async () => {
    renderWithProviders(
      <EventRSVPCard channelId="ch_comm" channelName="Community group" />,
    );
    await userEvent.click(screen.getByTestId('event-rsvp-run'));
    await waitFor(() => expect(screen.getByTestId('event-rsvp-list')).toBeInTheDocument());
    expect(screen.getByText('PTA potluck')).toBeInTheDocument();
    expect(screen.getByText('Saturday 3pm')).toBeInTheDocument();
    expect(screen.getByText('School gym')).toBeInTheDocument();
    expect(screen.getByText('RSVP by Friday')).toBeInTheDocument();
  });

  it('marks the chosen RSVP button as pressed', async () => {
    renderWithProviders(<EventRSVPCard channelId="ch_comm" />);
    await userEvent.click(screen.getByTestId('event-rsvp-run'));
    await waitFor(() => expect(screen.getByTestId('event-rsvp-list')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('event-rsvp-yes-0'));
    expect(screen.getByTestId('event-rsvp-yes-0')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('event-rsvp-no-0')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clears extracted events and RSVP picks when the channel changes', async () => {
    function Harness() {
      const [id, setId] = React.useState<string>('ch_comm');
      return (
        <>
          <button data-testid="harness-switch" onClick={() => setId('ch_other')}>
            switch
          </button>
          <EventRSVPCard channelId={id} channelName={id} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByTestId('event-rsvp-run'));
    await waitFor(() => expect(screen.getByTestId('event-rsvp-list')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('event-rsvp-yes-0'));

    await userEvent.click(screen.getByTestId('harness-switch'));
    // Old events + RSVP selections must be gone — anything still on screen
    // would be mislabeled as belonging to the new channel.
    expect(screen.queryByTestId('event-rsvp-list')).toBeNull();
    expect(screen.queryByText('PTA potluck')).toBeNull();
  });

  it('shows an error alert when the IPC call fails', async () => {
    vi.spyOn(aiApi, 'fetchEventRSVP').mockRejectedValueOnce(new Error('rip'));
    renderWithProviders(<EventRSVPCard channelId="ch_comm" />);
    await userEvent.click(screen.getByTestId('event-rsvp-run'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Event extraction failed: rip'),
    );
  });
});
