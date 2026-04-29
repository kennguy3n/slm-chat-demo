import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SourcePicker } from '../SourcePicker';
import type { Channel } from '../../../types/workspace';
import type { ThreadSummary } from '../../../types/knowledge';

const CHANNELS: Channel[] = [
  {
    id: 'ch_general',
    name: 'general',
    workspaceId: 'ws_acme',
    domainId: 'dm_general',
    context: 'b2b',
    kind: 'channel',
    memberIds: [],
  },
  {
    id: 'ch_engineering',
    name: 'engineering',
    workspaceId: 'ws_acme',
    domainId: 'dm_engineering',
    context: 'b2b',
    kind: 'channel',
    memberIds: [],
  },
];

const THREADS_BY_CHANNEL: Record<string, ThreadSummary[]> = {
  ch_engineering: [
    { id: 'th_1', channelId: 'ch_engineering', title: 'Kickoff Q3 planning', messageCount: 8 },
    { id: 'th_2', channelId: 'ch_engineering', title: 'Release 1.0 checklist', messageCount: 14 },
  ],
  ch_general: [],
};

function makeApi(overrides: Partial<Parameters<typeof SourcePicker>[0]['api']> = {}) {
  return {
    fetchWorkspaceChannels: vi.fn().mockResolvedValue(CHANNELS),
    fetchChannelThreads: vi.fn(
      async (cid: string) => THREADS_BY_CHANNEL[cid] ?? [],
    ),
    ...overrides,
  };
}

describe('SourcePicker', () => {
  it('renders channels fetched for the workspace', async () => {
    const api = makeApi();
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={api}
      />,
    );
    await waitFor(() => {
      expect(api.fetchWorkspaceChannels).toHaveBeenCalledWith('ws_acme');
    });
    expect(await screen.findByTestId('source-picker-channel-ch_general')).toBeInTheDocument();
    expect(screen.getByTestId('source-picker-channel-ch_engineering')).toBeInTheDocument();
  });

  it('adds a chip when a channel is checked and removes it when the chip × is clicked', async () => {
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={makeApi()}
      />,
    );
    const checkbox = await screen.findByTestId('source-picker-channel-ch_engineering');
    fireEvent.click(checkbox);
    expect(
      screen.getByTestId('source-picker-chip-channel-ch_engineering'),
    ).toHaveTextContent(/engineering/);

    fireEvent.click(
      screen.getByTestId('source-picker-chip-remove-channel-ch_engineering'),
    );
    expect(
      screen.queryByTestId('source-picker-chip-channel-ch_engineering'),
    ).toBeNull();
    expect(
      (screen.getByTestId('source-picker-channel-ch_engineering') as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it('switches to Threads tab and fetches threads for the selected channel', async () => {
    const api = makeApi();
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={api}
      />,
    );
    fireEvent.click(await screen.findByTestId('source-picker-channel-ch_engineering'));
    fireEvent.click(screen.getByTestId('source-picker-tab-threads'));

    await waitFor(() => {
      expect(api.fetchChannelThreads).toHaveBeenCalledWith('ch_engineering');
    });
    expect(await screen.findByTestId('source-picker-thread-th_1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('source-picker-thread-th_1'));
    expect(
      screen.getByTestId('source-picker-chip-thread-th_1'),
    ).toHaveTextContent(/Kickoff Q3 planning/);
  });

  it('empty threads state — selected channel has no threads yet', async () => {
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={makeApi()}
      />,
    );
    fireEvent.click(await screen.findByTestId('source-picker-channel-ch_general'));
    fireEvent.click(screen.getByTestId('source-picker-tab-threads'));
    expect(
      await screen.findByText(/No threads in this channel/i),
    ).toBeInTheDocument();
  });

  it('Threads tab tells the user to pick a channel first when nothing is selected', async () => {
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={makeApi()}
      />,
    );
    await screen.findByTestId('source-picker-channel-ch_general');
    fireEvent.click(screen.getByTestId('source-picker-tab-threads'));
    expect(
      screen.getByText(/Pick a channel first to browse its threads/i),
    ).toBeInTheDocument();
  });

  it('Files tab shows the Coming soon placeholder', async () => {
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={makeApi()}
      />,
    );
    await screen.findByTestId('source-picker-channel-ch_general');
    fireEvent.click(screen.getByTestId('source-picker-tab-files'));
    expect(screen.getByTestId('source-picker-tab-body-files')).toHaveTextContent(
      /coming soon/i,
    );
  });

  it('Confirm fires onSelect with the accumulated selections', async () => {
    const onSelect = vi.fn();
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={onSelect}
        onCancel={vi.fn()}
        api={makeApi()}
      />,
    );
    fireEvent.click(await screen.findByTestId('source-picker-channel-ch_engineering'));
    fireEvent.click(screen.getByTestId('source-picker-channel-ch_general'));

    fireEvent.click(screen.getByTestId('source-picker-confirm'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const sources = onSelect.mock.calls[0][0];
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map((s: { id: string }) => s.id))).toEqual(
      new Set(['ch_engineering', 'ch_general']),
    );
  });

  it('Cancel fires onCancel and not onSelect', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={onSelect}
        onCancel={onCancel}
        api={makeApi()}
      />,
    );
    await screen.findByTestId('source-picker-channel-ch_general');
    fireEvent.click(screen.getByTestId('source-picker-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Confirm button is disabled while no sources are selected', async () => {
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={makeApi()}
      />,
    );
    await screen.findByTestId('source-picker-channel-ch_general');
    expect(screen.getByTestId('source-picker-confirm')).toBeDisabled();
    fireEvent.click(screen.getByTestId('source-picker-channel-ch_general'));
    expect(screen.getByTestId('source-picker-confirm')).not.toBeDisabled();
  });

  it('initialSelected seeds the chip list with the caller-provided sources', async () => {
    render(
      <SourcePicker
        workspaceId="ws_acme"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        api={makeApi()}
        initialSelected={[
          { kind: 'channel', id: 'ch_engineering', name: 'engineering' },
        ]}
      />,
    );
    expect(
      await screen.findByTestId('source-picker-chip-channel-ch_engineering'),
    ).toBeInTheDocument();
  });
});
