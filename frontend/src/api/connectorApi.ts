import { apiFetch } from './client';
import type {
  Connector,
  ConnectorFile,
  RetrievalResult,
} from '../types/knowledge';

// connectorApi mirrors the Phase 5 backend endpoints:
//
//   GET    /api/connectors?workspaceId=                    — list connectors
//   GET    /api/connectors/{id}                            — fetch one
//   GET    /api/connectors/{id}/files                      — list files
//   GET    /api/channels/{channelId}/connector-files       — files visible from a channel
//   POST   /api/connectors/{id}/channels                   — attach to channel(s)
//   DELETE /api/connectors/{id}/channels/{channelId}       — detach
//   POST   /api/channels/{channelId}/index                 — (re-)build retrieval index
//   GET    /api/channels/{channelId}/search                — keyword search
//
// All endpoints are mocked locally — no real OAuth or external API
// calls. The renderer uses this client both for the SourcePicker /
// ConnectorPanel UI and for the per-channel retrieval index that
// grounds AI Employee recipe runs.

export async function fetchConnectors(workspaceId: string): Promise<Connector[]> {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const data = await apiFetch<{ connectors: Connector[] }>(`/api/connectors${qs}`);
  return data.connectors;
}

export async function fetchConnector(id: string): Promise<Connector> {
  const data = await apiFetch<{ connector: Connector }>(
    `/api/connectors/${encodeURIComponent(id)}`,
  );
  return data.connector;
}

export async function fetchConnectorFiles(
  connectorId: string,
): Promise<ConnectorFile[]> {
  const data = await apiFetch<{ files: ConnectorFile[] }>(
    `/api/connectors/${encodeURIComponent(connectorId)}/files`,
  );
  return data.files;
}

export async function fetchChannelConnectorFiles(
  channelId: string,
): Promise<ConnectorFile[]> {
  const data = await apiFetch<{ files: ConnectorFile[] }>(
    `/api/channels/${encodeURIComponent(channelId)}/connector-files`,
  );
  return data.files;
}

export async function attachConnectorToChannel(
  connectorId: string,
  channelId: string,
): Promise<Connector> {
  const data = await apiFetch<{ connector: Connector }>(
    `/api/connectors/${encodeURIComponent(connectorId)}/channels`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    },
  );
  return data.connector;
}

export async function detachConnectorFromChannel(
  connectorId: string,
  channelId: string,
): Promise<Connector> {
  const data = await apiFetch<{ connector: Connector }>(
    `/api/connectors/${encodeURIComponent(connectorId)}/channels/${encodeURIComponent(channelId)}`,
    { method: 'DELETE' },
  );
  return data.connector;
}

// Retrieval — Phase 5 keyword index. Renderer (re-)indexes a channel
// before kicking off an AI action that uses sources, then queries to
// pull source-attributed chunks back as additional prompt context.

export async function indexChannel(
  channelId: string,
): Promise<{ channelId: string; chunkCount: number }> {
  return apiFetch<{ channelId: string; chunkCount: number }>(
    `/api/channels/${encodeURIComponent(channelId)}/index`,
    { method: 'POST' },
  );
}

export async function searchChannel(
  channelId: string,
  query: string,
  topK = 5,
): Promise<RetrievalResult[]> {
  const qs = new URLSearchParams({ q: query, topK: String(topK) });
  const data = await apiFetch<{ results: RetrievalResult[] }>(
    `/api/channels/${encodeURIComponent(channelId)}/search?${qs.toString()}`,
  );
  return data.results;
}
