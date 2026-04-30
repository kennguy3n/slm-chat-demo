import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmartReplyBar } from '../SmartReplyBar';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { SmartReplyResponse } from '../../../types/ai';

vi.mock('../../../api/aiApi', () => ({
  fetchSmartReply: vi.fn(),
  fetchModelStatus: vi.fn(),
  fetchEgressPreview: vi.fn(),
}));

import { fetchSmartReply } from '../../../api/aiApi';

const sample: SmartReplyResponse = {
  replies: ['On my way!', 'Sounds good — talk soon.', 'Got it, thanks.'],
  model: 'bonsai-1.7b',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
  channelId: 'ch_family',
  sourceMessageId: 'msg_fam_1',
};

describe('SmartReplyBar', () => {
  beforeEach(() => {
    vi.mocked(fetchSmartReply).mockReset();
  });

  it('renders 2-3 suggestion chips after the fetch resolves', async () => {
    vi.mocked(fetchSmartReply).mockResolvedValueOnce(sample);
    renderWithProviders(
      <SmartReplyBar channelId="ch_family" sourceMessageId="msg_fam_1" onSelect={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('smart-reply-chips')).toBeInTheDocument();
    });
    expect(screen.getByTestId('smart-reply-chip-0')).toHaveTextContent('On my way!');
    expect(screen.getByTestId('smart-reply-chip-1')).toHaveTextContent(/sounds good/i);
    expect(screen.getByTestId('smart-reply-chip-2')).toHaveTextContent(/got it/i);
  });

  it('calls onSelect with the chip text when a chip is clicked', async () => {
    vi.mocked(fetchSmartReply).mockResolvedValueOnce(sample);
    const onSelect = vi.fn();
    renderWithProviders(
      <SmartReplyBar channelId="ch_family" sourceMessageId="msg_fam_1" onSelect={onSelect} />,
    );
    await waitFor(() => screen.getByTestId('smart-reply-chip-0'));
    await userEvent.click(screen.getByTestId('smart-reply-chip-0'));
    expect(onSelect).toHaveBeenCalledWith('On my way!');
  });

  it('renders a privacy strip with on-device / 0 egress', async () => {
    vi.mocked(fetchSmartReply).mockResolvedValueOnce(sample);
    renderWithProviders(
      <SmartReplyBar channelId="ch_family" onSelect={vi.fn()} />,
    );
    await waitFor(() => screen.getByTestId('privacy-compute'));
    expect(screen.getByTestId('privacy-compute')).toHaveTextContent('On-device');
    expect(screen.getByTestId('privacy-egress')).toHaveTextContent('0 B');
    expect(screen.getByTestId('privacy-model')).toHaveTextContent('bonsai-1.7b');
  });

  it('renders an error message when the request fails', async () => {
    vi.mocked(fetchSmartReply).mockRejectedValueOnce(new Error('network is down'));
    renderWithProviders(
      <SmartReplyBar channelId="ch_family" onSelect={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network is down/i);
    });
  });
});
