import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../MessageList';
import type { Message } from '../../../types/chat';
import type { User } from '../../../types/workspace';

const alice: User = {
  id: 'user_alice',
  displayName: 'Alice Chen',
  email: 'a@x',
  avatarColor: '#7c3aed',
};

const messages: Message[] = [
  {
    id: 'm1',
    channelId: 'c1',
    senderId: 'user_alice',
    content: 'hello world',
    createdAt: '2026-04-28T08:00:00Z',
  },
  {
    id: 'm2',
    channelId: 'c1',
    senderId: 'user_alice',
    content: 'second message',
    createdAt: '2026-04-28T08:01:00Z',
  },
];

describe('MessageList', () => {
  it('renders the empty state when there are no messages', () => {
    render(<MessageList messages={[]} users={{}} emptyLabel="No messages here" />);
    expect(screen.getByRole('status')).toHaveTextContent('No messages here');
  });

  it('renders one bubble per message with the sender name', () => {
    render(<MessageList messages={messages} users={{ user_alice: alice }} />);
    const names = screen.getAllByText('Alice Chen');
    expect(names).toHaveLength(2);
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.getByText('second message')).toBeInTheDocument();
  });
});
