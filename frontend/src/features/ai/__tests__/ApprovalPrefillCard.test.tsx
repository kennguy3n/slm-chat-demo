import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalPrefillCard } from '../ApprovalPrefillCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { PrefillApprovalResponse } from '../../../types/ai';

const sample: PrefillApprovalResponse = {
  threadId: 'thr_vendor',
  channelId: 'ch_vendor',
  templateId: 'vendor',
  title: 'Vendor approval — Acme Logs',
  fields: {
    vendor: 'Acme Logs',
    amount: '$42,000 / yr',
    justification: 'Lowest-cost SOC 2-cleared bidder.',
    risk: 'medium',
  },
  sourceMessageIds: ['msg_vendor_1', 'msg_vendor_2'],
  model: 'bonsai-8b',
  tier: 'local',
  reason: 'Routed prefill_approval to on-device Bonsai-8B for stronger reasoning.',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('ApprovalPrefillCard', () => {
  it('renders the title, tier, and AI badge', () => {
    renderWithProviders(<ApprovalPrefillCard prefill={sample} />);
    expect(screen.getByTestId('approval-prefill-title')).toHaveTextContent(
      'Vendor approval — Acme Logs',
    );
    expect(screen.getByTestId('approval-prefill-tier')).toHaveTextContent('LOCAL');
  });

  it('renders the prefilled fields in editable inputs', () => {
    renderWithProviders(<ApprovalPrefillCard prefill={sample} />);
    expect(screen.getByTestId('approval-prefill-vendor')).toHaveValue('Acme Logs');
    expect(screen.getByTestId('approval-prefill-amount')).toHaveValue('$42,000 / yr');
    expect(screen.getByTestId('approval-prefill-risk')).toHaveValue('medium');
    expect(screen.getByTestId('approval-prefill-justification')).toHaveValue(
      'Lowest-cost SOC 2-cleared bidder.',
    );
  });

  it('lets the user edit a field and accepts the merged values', async () => {
    const onAccept = vi.fn();
    renderWithProviders(<ApprovalPrefillCard prefill={sample} onAccept={onAccept} />);
    const amount = screen.getByTestId('approval-prefill-amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '$50,000 / yr');
    await userEvent.click(screen.getByTestId('approval-prefill-accept'));
    expect(onAccept).toHaveBeenCalledOnce();
    const fields = onAccept.mock.calls[0][0];
    expect(fields.amount).toBe('$50,000 / yr');
    expect(fields.vendor).toBe('Acme Logs');
  });

  it('disables actions after accept', async () => {
    renderWithProviders(<ApprovalPrefillCard prefill={sample} />);
    const accept = screen.getByTestId('approval-prefill-accept');
    await userEvent.click(accept);
    expect(accept).toBeDisabled();
    expect(accept).toHaveTextContent(/submitted/i);
  });

  it('keeps the form editable and surfaces an error when onAccept rejects', async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(new Error('network down'));
    renderWithProviders(<ApprovalPrefillCard prefill={sample} onAccept={onAccept} />);
    const accept = screen.getByTestId('approval-prefill-accept');
    await userEvent.click(accept);

    expect(await screen.findByTestId('approval-prefill-error')).toHaveTextContent(
      /network down/i,
    );
    expect(accept).not.toBeDisabled();
    expect(accept).toHaveTextContent(/submit for approval/i);
    expect(screen.getByTestId('approval-prefill-vendor')).not.toBeDisabled();
  });

  it('retries successfully after a transient onAccept failure', async () => {
    const onAccept = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    renderWithProviders(<ApprovalPrefillCard prefill={sample} onAccept={onAccept} />);
    const accept = screen.getByTestId('approval-prefill-accept');
    await userEvent.click(accept);
    await screen.findByTestId('approval-prefill-error');
    await userEvent.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(2);
    expect(accept).toBeDisabled();
    expect(accept).toHaveTextContent(/submitted/i);
  });

  it('surfaces missing fields in the missing list', () => {
    const incomplete: PrefillApprovalResponse = {
      ...sample,
      fields: { vendor: 'Acme Logs' },
    };
    renderWithProviders(<ApprovalPrefillCard prefill={incomplete} />);
    const missing = screen.getByTestId('approval-prefill-missing');
    expect(missing).toHaveTextContent('amount');
    expect(missing).toHaveTextContent('justification');
    expect(missing).toHaveTextContent('risk');
  });

  it('renders the privacy strip with the model and on-device compute', () => {
    renderWithProviders(<ApprovalPrefillCard prefill={sample} />);
    expect(screen.getByTestId('privacy-model')).toHaveTextContent('bonsai-8b');
    expect(screen.getByTestId('privacy-compute')).toHaveTextContent('On-device');
  });
});
