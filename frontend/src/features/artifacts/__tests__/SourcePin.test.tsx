import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcePin } from '../SourcePin';

describe('SourcePin', () => {
  it('renders the footnote marker and excerpt', () => {
    render(
      <SourcePin
        index={0}
        pin={{
          sectionId: 'sec_goal',
          sourceMessageId: 'm1',
          sourceThreadId: 't1',
          excerpt: 'We need inline translation.',
          sender: 'alice',
        }}
      />,
    );
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText(/inline translation/i)).toBeInTheDocument();
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
  });

  it('calls onNavigate with the pin when clicked', async () => {
    const onNavigate = vi.fn();
    const pin = {
      sectionId: 'sec_goal',
      sourceMessageId: 'm1',
      sourceThreadId: 't1',
      excerpt: 'Hello',
      sender: 'alice',
    };
    render(<SourcePin index={0} pin={pin} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByTestId('source-pin-sec_goal-0'));
    expect(onNavigate).toHaveBeenCalledWith(pin);
  });
});
