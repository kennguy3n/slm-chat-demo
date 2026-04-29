import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EgressSummaryPanel } from '../EgressSummaryPanel';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { EgressSummaryResult } from '../../../types/electron';

const empty: EgressSummaryResult = {
  totalBytes: 0,
  totalRequests: 0,
  totalRedactions: 0,
  byChannel: {},
  byModel: {},
  recent: [],
};

const populated: EgressSummaryResult = {
  totalBytes: 2048,
  totalRequests: 3,
  totalRedactions: 5,
  byChannel: {
    ch_engineering: { bytes: 1500, requests: 2 },
    ch_sales: { bytes: 548, requests: 1 },
  },
  byModel: {
    'confidential-large': { bytes: 2048, requests: 3 },
  },
  recent: [
    {
      timestamp: 1_700_000_002_000,
      taskType: 'summarize',
      egressBytes: 800,
      redactionCount: 2,
      model: 'confidential-large',
      channelId: 'ch_engineering',
    },
    {
      timestamp: 1_700_000_001_000,
      taskType: 'draft_artifact',
      egressBytes: 700,
      redactionCount: 1,
      model: 'confidential-large',
      channelId: 'ch_engineering',
    },
  ],
};

describe('EgressSummaryPanel', () => {
  it('renders the privacy-positive zero state when no summary is available', () => {
    renderWithProviders(<EgressSummaryPanel />);
    expect(screen.getByTestId('egress-summary-panel')).toHaveClass(
      'egress-summary-panel--empty',
    );
    expect(screen.getByTestId('egress-summary-total')).toHaveTextContent('0 B');
    expect(screen.getByText(/all inference is on-device/i)).toBeInTheDocument();
  });

  it('renders the populated summary when one is supplied via override', () => {
    renderWithProviders(<EgressSummaryPanel summaryOverride={populated} />);
    expect(screen.getByTestId('egress-summary-total')).toHaveTextContent('2.0 KB');
    expect(screen.getByTestId('egress-summary-requests')).toHaveTextContent('3');
    expect(screen.getByTestId('egress-summary-redactions')).toHaveTextContent('5');
    expect(
      screen.getByTestId('egress-summary-channel-ch_engineering'),
    ).toHaveTextContent('1.5 KB');
    expect(
      screen.getByTestId('egress-summary-channel-ch_sales'),
    ).toHaveTextContent('548 B');
    expect(
      screen.getByTestId('egress-summary-model-confidential-large'),
    ).toHaveTextContent('2.0 KB');
    expect(screen.getAllByTestId('egress-summary-recent-item')).toHaveLength(2);
  });

  it('clicking Reset calls the onReset callback and renders the new (empty) state', async () => {
    const onReset = vi.fn(async () => empty);
    renderWithProviders(
      <EgressSummaryPanel summaryOverride={populated} onReset={onReset} />,
    );
    expect(screen.getByTestId('egress-summary-total')).toHaveTextContent('2.0 KB');
    await userEvent.click(screen.getByTestId('egress-summary-reset'));
    await waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('egress-summary-total')).toHaveTextContent('0 B');
    });
  });

  it('groups channelless recent entries under the "(unscoped)" channel breakdown', () => {
    const summary: EgressSummaryResult = {
      totalBytes: 50,
      totalRequests: 1,
      totalRedactions: 0,
      byChannel: { '(unscoped)': { bytes: 50, requests: 1 } },
      byModel: { 'confidential-large': { bytes: 50, requests: 1 } },
      recent: [
        {
          timestamp: 1_700_000_001_000,
          taskType: 'summarize',
          egressBytes: 50,
          redactionCount: 0,
          model: 'confidential-large',
        },
      ],
    };
    renderWithProviders(<EgressSummaryPanel summaryOverride={summary} />);
    expect(screen.getByTestId('egress-summary-channel-(unscoped)')).toHaveTextContent(
      '50 B',
    );
  });
});
