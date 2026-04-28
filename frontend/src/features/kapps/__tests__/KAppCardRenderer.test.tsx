import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KAppCardRenderer } from '../KAppCardRenderer';
import type { KAppCard } from '../../../types/kapps';

describe('KAppCardRenderer', () => {
  const cases: { name: string; card: KAppCard; testId: string }[] = [
    {
      name: 'task',
      testId: 'task-card',
      card: {
        kind: 'task',
        task: {
          id: 't',
          channelId: 'c',
          title: 'Title',
          status: 'open',
          aiGenerated: false,
        },
      },
    },
    {
      name: 'approval',
      testId: 'approval-card',
      card: {
        kind: 'approval',
        approval: {
          id: 'a',
          channelId: 'c',
          templateId: 'tpl',
          title: 'Approval',
          requester: 'u',
          approvers: [],
          fields: {},
          status: 'pending',
          decisionLog: [],
          aiGenerated: false,
        },
      },
    },
    {
      name: 'artifact',
      testId: 'artifact-card',
      card: {
        kind: 'artifact',
        artifact: {
          id: 'art',
          channelId: 'c',
          type: 'PRD',
          title: 'PRD',
          versions: [
            { version: 1, createdAt: '2026-01-01T00:00:00Z', author: 'u' },
          ],
          status: 'draft',
          aiGenerated: false,
        },
      },
    },
    {
      name: 'event',
      testId: 'event-card',
      card: {
        kind: 'event',
        event: {
          id: 'evt',
          channelId: 'c',
          title: 'Event',
          startsAt: '2026-01-01T00:00:00Z',
          rsvp: 'none',
          attendeeCount: 0,
          aiGenerated: false,
        },
      },
    },
  ];

  cases.forEach(({ name, card, testId }) => {
    it(`renders the matching card for kind=${name}`, () => {
      render(<KAppCardRenderer card={card} />);
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });
  });

  it('renders nothing for an unknown kind', () => {
    const { container } = render(
      <KAppCardRenderer card={{ kind: 'task' } as KAppCard} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
