import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '../EventCard';
import type { EventCard as EventCardData } from '../../../types/kapps';

const baseEvent: EventCardData = {
  id: 'evt_1',
  channelId: 'ch_neighborhood',
  sourceMessageId: 'msg_comm_1',
  title: 'Neighborhood block party',
  startsAt: '2026-05-16T22:00:00Z',
  location: 'Maple Park',
  rsvp: 'accepted',
  attendeeCount: 12,
  aiGenerated: true,
};

describe('EventCard', () => {
  it('renders title, location, attendee count, and RSVP', () => {
    render(<EventCard event={baseEvent} />);
    expect(screen.getByText('Neighborhood block party')).toBeInTheDocument();
    expect(screen.getByText('Maple Park')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Going')).toBeInTheDocument();
  });

  it('emits accept and decline RSVP callbacks', async () => {
    const onRSVP = vi.fn();
    render(<EventCard event={baseEvent} onRSVP={onRSVP} />);
    await userEvent.click(screen.getByRole('button', { name: /rsvp accept/i }));
    expect(onRSVP).toHaveBeenLastCalledWith('accepted');
    await userEvent.click(screen.getByRole('button', { name: /rsvp decline/i }));
    expect(onRSVP).toHaveBeenLastCalledWith('declined');
  });
});
