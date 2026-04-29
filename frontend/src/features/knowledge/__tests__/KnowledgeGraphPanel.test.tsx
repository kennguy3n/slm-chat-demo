import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KnowledgeGraphPanel } from '../KnowledgeGraphPanel';
import type { KnowledgeEntity } from '../../../types/knowledge';

const ENTITIES: KnowledgeEntity[] = [
  {
    id: 'kg_decision_msg_vend_r4',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    sourceMessageId: 'msg_vend_r4',
    kind: 'decision',
    title: 'Decision: pulling that now — pending decision',
    description: 'pulling that now — pending decision in this thread.',
    status: 'open',
    createdAt: '2026-04-01T00:00:00Z',
    confidence: 0.7,
  },
  {
    id: 'kg_risk_msg_vend_r1',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    sourceMessageId: 'msg_vend_r1',
    kind: 'risk',
    title: 'Risk: what are the bids and risk notes?',
    description: 'what are the bids and risk notes?',
    status: 'open',
    createdAt: '2026-04-01T00:00:00Z',
    confidence: 0.7,
  },
  {
    id: 'kg_requirement_msg_vend_root',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    sourceMessageId: 'msg_vend_root',
    kind: 'requirement',
    title: 'Requirement: Need to lock vendor pricing',
    description: 'Need to lock vendor pricing for the Q3 logging contract',
    status: 'open',
    createdAt: '2026-04-01T00:00:00Z',
    confidence: 0.65,
  },
  {
    id: 'kg_owner_msg_assign',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    sourceMessageId: 'msg_assign',
    kind: 'owner',
    title: 'Owner: assigned to @dave',
    description: '@dave please draft the contract',
    actors: ['dave'],
    status: 'open',
    createdAt: '2026-04-01T00:00:00Z',
    confidence: 0.75,
  },
  {
    id: 'kg_deadline_msg_due',
    channelId: 'ch_vendor_management',
    threadId: 'msg_vend_root',
    sourceMessageId: 'msg_due',
    kind: 'deadline',
    title: 'Deadline: due Friday',
    description: 'Vendor decision due Friday by EOD',
    dueDate: '2026-05-01T00:00:00Z',
    status: 'open',
    createdAt: '2026-04-01T00:00:00Z',
    confidence: 0.7,
  },
];

function makeApi(overrides: Partial<Parameters<typeof KnowledgeGraphPanel>[0]['api']> = {}) {
  return {
    fetchKnowledge: vi
      .fn<(channelId: string, kind?: string) => Promise<KnowledgeEntity[]>>()
      .mockResolvedValue(ENTITIES),
    extractKnowledge: vi
      .fn<(channelId: string) => Promise<KnowledgeEntity[]>>()
      .mockResolvedValue(ENTITIES),
    ...overrides,
  };
}

describe('KnowledgeGraphPanel', () => {
  it('renders the five sections with their entity counts', async () => {
    render(
      <KnowledgeGraphPanel
        channelId="ch_vendor_management"
        channelName="vendor-management"
        api={makeApi()}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('knowledge-graph-section-decision'),
      ).toBeInTheDocument();
    });
    for (const kind of ['decision', 'owner', 'risk', 'requirement', 'deadline']) {
      expect(
        screen.getByTestId(`knowledge-graph-section-${kind}`),
      ).toBeInTheDocument();
    }
    // Decision count is 1.
    expect(
      screen.getByTestId('knowledge-graph-section-toggle-decision'),
    ).toHaveTextContent(/Decisions \(1\)/);
    // Each entity card is mounted with its source link.
    expect(
      screen.getByTestId('knowledge-graph-card-source-kg_decision_msg_vend_r4'),
    ).toHaveAttribute('href', '#message-msg_vend_r4');
  });

  it('shows owner actors and deadline due dates on cards', async () => {
    render(
      <KnowledgeGraphPanel
        channelId="ch_vendor_management"
        api={makeApi()}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('knowledge-graph-card-actors-kg_owner_msg_assign'),
      ).toHaveTextContent('@dave');
    });
    expect(
      screen.getByTestId('knowledge-graph-card-due-kg_deadline_msg_due'),
    ).toHaveTextContent(/due 2026-05-01/);
  });

  it('triggers extract via the API and refreshes the list', async () => {
    const api = makeApi({
      fetchKnowledge: vi
        .fn<(channelId: string, kind?: string) => Promise<KnowledgeEntity[]>>()
        .mockResolvedValue([]),
      extractKnowledge: vi
        .fn<(channelId: string) => Promise<KnowledgeEntity[]>>()
        .mockResolvedValue(ENTITIES),
    });
    render(
      <KnowledgeGraphPanel
        channelId="ch_vendor_management"
        api={api}
      />,
    );
    expect(
      await screen.findByTestId('knowledge-graph-empty'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('knowledge-graph-extract'));
    await waitFor(() => {
      expect(api.extractKnowledge).toHaveBeenCalledWith('ch_vendor_management');
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('knowledge-graph-section-toggle-risk'),
      ).toHaveTextContent(/Risks \(1\)/);
    });
  });

  it('renders the empty state when no entities exist', async () => {
    render(
      <KnowledgeGraphPanel
        channelId="ch_vendor_management"
        api={makeApi({
          fetchKnowledge: vi
            .fn<(channelId: string, kind?: string) => Promise<KnowledgeEntity[]>>()
            .mockResolvedValue([]),
        })}
      />,
    );
    expect(
      await screen.findByTestId('knowledge-graph-empty'),
    ).toHaveTextContent(/No entities extracted yet/i);
  });

  it('collapses a section when its toggle is clicked', async () => {
    render(
      <KnowledgeGraphPanel
        channelId="ch_vendor_management"
        api={makeApi()}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('knowledge-graph-card-kg_decision_msg_vend_r4'),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByTestId('knowledge-graph-section-toggle-decision'),
    );
    expect(
      screen.queryByTestId('knowledge-graph-card-kg_decision_msg_vend_r4'),
    ).toBeNull();
  });
});
