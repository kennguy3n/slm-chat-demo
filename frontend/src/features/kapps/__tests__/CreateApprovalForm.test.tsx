import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateApprovalForm } from '../CreateApprovalForm';
import { useKAppsStore } from '../../../stores/kappsStore';

describe('CreateApprovalForm', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
    useKAppsStore.setState({ tasksByChannel: {}, error: null, loading: false });
  });
  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('shows a validation error when title is empty', async () => {
    render(<CreateApprovalForm channelId="ch_general" approverOptions={[]} />);
    await userEvent.click(screen.getByTestId('create-approval-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/title is required/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits a payload to /api/kapps/approvals with prefilled fields and selected approvers', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          approval: {
            id: 'apv_1',
            channelId: 'ch_general',
            templateId: 'vendor_v1',
            title: 'Vendor approval — Acme',
            requester: 'user_alice',
            approvers: ['user_bob'],
            status: 'pending',
            fields: { vendor: 'Acme', amount: '$10', justification: 'why', risk: 'low' },
            decisions: [],
            createdAt: '2026-04-29T00:00:00Z',
            updatedAt: '2026-04-29T00:00:00Z',
            aiGenerated: true,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const onCreated = vi.fn();
    render(
      <CreateApprovalForm
        channelId="ch_general"
        sourceThreadId="thr_x"
        templateId="vendor_v1"
        initialTitle="Vendor approval — Acme"
        initialVendor="Acme"
        initialAmount="$10"
        initialJustification="why"
        initialRisk="low"
        approverOptions={[
          { id: 'user_bob', name: 'Bob' },
          { id: 'user_carol', name: 'Carol' },
        ]}
        aiGenerated
        onCreated={onCreated}
      />,
    );
    await userEvent.click(screen.getByTestId('create-approval-approver-user_bob'));
    await userEvent.click(screen.getByTestId('create-approval-submit'));

    await screen.findByTestId('create-approval-source');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body ?? '{}') as string);
    expect(body).toEqual(
      expect.objectContaining({
        channelId: 'ch_general',
        templateId: 'vendor_v1',
        title: 'Vendor approval — Acme',
        approvers: ['user_bob'],
        sourceThreadId: 'thr_x',
        aiGenerated: true,
        fields: expect.objectContaining({
          vendor: 'Acme',
          amount: '$10',
          justification: 'why',
          risk: 'low',
        }),
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('surfaces API errors via the alert region', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(
      <CreateApprovalForm channelId="ch_general" approverOptions={[]} initialTitle="Will fail" />,
    );
    await userEvent.click(screen.getByTestId('create-approval-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom|400/);
  });
});
