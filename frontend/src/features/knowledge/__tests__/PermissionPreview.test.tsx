import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PermissionPreview } from '../PermissionPreview';
import type { ConnectorFile, SelectedSource } from '../../../types/knowledge';

const SOURCES: SelectedSource[] = [
  { kind: 'channel', id: 'ch_engineering', name: 'engineering' },
  {
    kind: 'thread',
    id: 'th_1',
    name: 'Kickoff Q3 planning',
    parentChannelId: 'ch_engineering',
    parentChannelName: 'engineering',
  },
  {
    kind: 'file',
    id: 'file_acme_q3_prd',
    name: 'Q3 Logging Platform PRD.gdoc',
    connectorId: 'conn_gdrive_acme',
    connectorName: 'Acme Corp Drive',
  },
];

const FILES: ConnectorFile[] = [
  {
    id: 'file_acme_q3_prd',
    connectorId: 'conn_gdrive_acme',
    name: 'Q3 Logging Platform PRD.gdoc',
    mimeType: 'application/vnd.google-apps.document',
    size: 100,
    excerpt: '',
    url: '',
    permissions: [],
  },
];

describe('PermissionPreview', () => {
  it('renders one row per source with the connector name surfaced for files', () => {
    render(
      <PermissionPreview
        sources={SOURCES}
        connectorFiles={FILES}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const list = screen.getByTestId('permission-preview-list');
    expect(list).toHaveTextContent(/#engineering/);
    expect(list).toHaveTextContent(/Kickoff Q3 planning/);
    expect(list).toHaveTextContent(/Q3 Logging Platform PRD/);
    expect(list).toHaveTextContent(/Acme Corp Drive/);
  });

  it('shows the 0-byte egress badge', () => {
    render(
      <PermissionPreview
        sources={SOURCES}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('permission-preview-egress')).toHaveTextContent(
      /0 bytes will leave this device/i,
    );
  });

  it('summarises counts at the top', () => {
    render(
      <PermissionPreview
        sources={SOURCES}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/1 channel · 1 thread · 1 file/i),
    ).toBeInTheDocument();
  });

  it('confirm fires onConfirm; cancel fires onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PermissionPreview
        sources={SOURCES}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('permission-preview-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('permission-preview-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirm is disabled when there are no sources', () => {
    render(
      <PermissionPreview
        sources={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('permission-preview-confirm')).toBeDisabled();
  });
});
