import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalCard } from '../ApprovalCard';
import type { Approval } from '../../../types/kapps';

const baseApproval: Approval = {
  id: 'appr_1',
  channelId: 'ch_vendor_management',
  templateId: 'vendor_v1',
  title: 'Q3 logging vendor contract',
  requester: 'user_dave',
  approvers: ['user_eve'],
  fields: {
    vendor: 'Acme Logs',
    amount: '$42,000 / yr',
    justification: 'Lowest-cost SOC 2-cleared bidder.',
    risk: 'medium',
  },
  status: 'pending',
  decisionLog: [
    { at: '2026-04-28T08:00:00Z', actor: 'user_eve', decision: 'comment', note: 'Need SOC 2 doc' },
  ],
  sourceThreadId: 'msg_vend_root',
  aiGenerated: true,
};

describe('ApprovalCard', () => {
  it('renders requester, approvers, vendor, amount, risk, and justification', () => {
    render(<ApprovalCard approval={baseApproval} />);
    expect(screen.getByText('Q3 logging vendor contract')).toBeInTheDocument();
    expect(screen.getByText('user_dave')).toBeInTheDocument();
    // user_eve appears both as approver and as the decision-log actor.
    expect(screen.getAllByText('user_eve').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Acme Logs')).toBeInTheDocument();
    expect(screen.getByText('$42,000 / yr')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText(/Lowest-cost SOC 2-cleared bidder/i)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders the decision log count and entries', () => {
    render(<ApprovalCard approval={baseApproval} />);
    expect(screen.getByText(/Decision log \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Need SOC 2 doc/)).toBeInTheDocument();
  });

  it('shows the empty-decision message when log is empty', () => {
    render(<ApprovalCard approval={{ ...baseApproval, decisionLog: [] }} />);
    expect(screen.getByText(/No decisions recorded yet/i)).toBeInTheDocument();
  });

  it('calls onOpenSource with the source thread id', async () => {
    const onOpenSource = vi.fn();
    render(<ApprovalCard approval={baseApproval} onOpenSource={onOpenSource} />);
    await userEvent.click(screen.getByRole('button', { name: /view source thread/i }));
    expect(onOpenSource).toHaveBeenCalledWith('msg_vend_root');
  });
});
