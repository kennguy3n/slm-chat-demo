import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectorPanel } from '../ConnectorPanel';
import type { Connector, ConnectorFile } from '../../../types/knowledge';

const CONNECTOR: Connector = {
  id: 'conn_gdrive_acme',
  kind: 'google_drive',
  name: 'Acme Corp Drive',
  workspaceId: 'ws_acme',
  channelIds: ['ch_vendor_management'],
  status: 'connected',
  createdAt: '2026-04-01T00:00:00Z',
};

const FILES: ConnectorFile[] = [
  {
    id: 'f1',
    connectorId: 'conn_gdrive_acme',
    name: 'PRD.gdoc',
    mimeType: 'application/vnd.google-apps.document',
    size: 100,
    excerpt: '',
    url: '',
    permissions: [],
  },
  {
    id: 'f2',
    connectorId: 'conn_gdrive_acme',
    name: 'Contract.pdf',
    mimeType: 'application/pdf',
    size: 200,
    excerpt: '',
    url: '',
    permissions: [],
  },
];

function makeApi(overrides: Partial<Parameters<typeof ConnectorPanel>[0]['api']> = {}) {
  return {
    fetchConnectors: vi
      .fn<(workspaceId: string) => Promise<Connector[]>>()
      .mockResolvedValue([CONNECTOR]),
    fetchConnectorFiles: vi
      .fn<(connectorId: string) => Promise<ConnectorFile[]>>()
      .mockResolvedValue(FILES),
    attachConnectorToChannel: vi
      .fn<(connectorId: string, channelId: string) => Promise<Connector>>()
      .mockImplementation(async (cid, chid) => ({
        ...CONNECTOR,
        id: cid,
        channelIds: [...CONNECTOR.channelIds, chid],
      })),
    detachConnectorFromChannel: vi
      .fn<(connectorId: string, channelId: string) => Promise<Connector>>()
      .mockImplementation(async (cid, chid) => ({
        ...CONNECTOR,
        id: cid,
        channelIds: CONNECTOR.channelIds.filter((c) => c !== chid),
      })),
    ...overrides,
  };
}

describe('ConnectorPanel', () => {
  it('renders connectors with file counts and attached status', async () => {
    render(
      <ConnectorPanel
        workspaceId="ws_acme"
        channelId="ch_vendor_management"
        channelName="vendor-management"
        api={makeApi()}
      />,
    );
    expect(
      await screen.findByTestId('connector-panel-row-conn_gdrive_acme'),
    ).toHaveTextContent(/Acme Corp Drive/);
    expect(screen.getByTestId('connector-panel-row-conn_gdrive_acme')).toHaveTextContent(
      /2 files/,
    );
    const toggle = screen.getByTestId(
      'connector-panel-toggle-conn_gdrive_acme',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('attaches the connector when an unattached row is toggled on', async () => {
    const api = makeApi();
    render(
      <ConnectorPanel
        workspaceId="ws_acme"
        channelId="ch_engineering"
        channelName="engineering"
        api={api}
      />,
    );
    const toggle = (await screen.findByTestId(
      'connector-panel-toggle-conn_gdrive_acme',
    )) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(api.attachConnectorToChannel).toHaveBeenCalledWith(
        'conn_gdrive_acme',
        'ch_engineering',
      );
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId(
          'connector-panel-toggle-conn_gdrive_acme',
        ) as HTMLInputElement).checked,
      ).toBe(true);
    });
  });

  it('detaches the connector when an attached row is toggled off', async () => {
    const api = makeApi();
    render(
      <ConnectorPanel
        workspaceId="ws_acme"
        channelId="ch_vendor_management"
        channelName="vendor-management"
        api={api}
      />,
    );
    const toggle = (await screen.findByTestId(
      'connector-panel-toggle-conn_gdrive_acme',
    )) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(api.detachConnectorFromChannel).toHaveBeenCalledWith(
        'conn_gdrive_acme',
        'ch_vendor_management',
      );
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId(
          'connector-panel-toggle-conn_gdrive_acme',
        ) as HTMLInputElement).checked,
      ).toBe(false);
    });
  });

  it('renders an empty state when the workspace has no connectors', async () => {
    render(
      <ConnectorPanel
        workspaceId="ws_acme"
        channelId="ch_vendor_management"
        api={makeApi({
          fetchConnectors: vi
            .fn<(workspaceId: string) => Promise<Connector[]>>()
            .mockResolvedValue([]),
        })}
      />,
    );
    expect(
      await screen.findByText(/No connectors in this workspace/i),
    ).toBeInTheDocument();
  });
});
