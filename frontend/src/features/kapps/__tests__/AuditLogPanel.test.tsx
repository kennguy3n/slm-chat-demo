import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AuditLogPanel } from '../AuditLogPanel';
import type { AuditEntry } from '../../../types/audit';

const sampleEntries: AuditEntry[] = [
  {
    id: 'audit_1',
    timestamp: '2026-04-29T12:00:00Z',
    eventType: 'task.created',
    objectKind: 'task',
    objectId: 'task_1',
    actor: 'user_alice',
    details: { title: 'Wire audit log', status: 'todo' },
  },
  {
    id: 'audit_2',
    timestamp: '2026-04-29T12:05:00Z',
    eventType: 'task.updated',
    objectKind: 'task',
    objectId: 'task_1',
    actor: 'user_bob',
    details: { status: 'in_progress' },
  },
];

describe('AuditLogPanel', () => {
  it('renders the timeline of audit entries', async () => {
    const fetcher = vi.fn().mockResolvedValue(sampleEntries);
    renderWithProviders(
      <AuditLogPanel objectId="task_1" objectKind="task" injectedFetch={fetcher} />,
    );
    expect(await screen.findByText('Task created')).toBeInTheDocument();
    expect(screen.getByText('Task updated')).toBeInTheDocument();
    expect(screen.getByText('user_alice')).toBeInTheDocument();
    expect(screen.getByText('user_bob')).toBeInTheDocument();
    expect(screen.getByText(/title: Wire audit log/)).toBeInTheDocument();
    expect(screen.getByText(/2 events/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('task_1', 'task');
  });

  it('renders an empty state when no entries are returned', async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    renderWithProviders(
      <AuditLogPanel objectId="task_unknown" injectedFetch={fetcher} />,
    );
    expect(await screen.findByText(/no audit entries yet/i)).toBeInTheDocument();
  });

  it('uses initialEntries without firing a fetch', () => {
    const fetcher = vi.fn();
    renderWithProviders(
      <AuditLogPanel
        objectId="task_1"
        objectKind="task"
        injectedFetch={fetcher}
        initialEntries={sampleEntries}
      />,
    );
    expect(screen.getByText('Task created')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('renders Export JSON / CSV buttons and triggers downloads (Phase 6)', async () => {
    const exporter = vi.fn().mockResolvedValue('blob:mock-url');
    // jsdom does not implement URL.revokeObjectURL — patch it on so
    // the post-download cleanup path doesn't throw on the deferred
    // setTimeout callback. We leave it installed for the rest of the
    // suite because uninstalling it during the timeout window races
    // the assertion phase.
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};

    renderWithProviders(
      <AuditLogPanel
        objectId="task_1"
        objectKind="task"
        initialEntries={sampleEntries}
        injectedExport={exporter}
      />,
    );

    const jsonBtn = screen.getByTestId('audit-export-json');
    const csvBtn = screen.getByTestId('audit-export-csv');
    expect(jsonBtn).toBeInTheDocument();
    expect(csvBtn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(jsonBtn);
    await waitFor(() =>
      expect(exporter).toHaveBeenCalledWith('json', {
        objectId: 'task_1',
        objectKind: 'task',
      }),
    );

    await user.click(csvBtn);
    await waitFor(() =>
      expect(exporter).toHaveBeenCalledWith('csv', {
        objectId: 'task_1',
        objectKind: 'task',
      }),
    );

  });

  it('shows an export error when the exporter rejects', async () => {
    const exporter = vi.fn().mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <AuditLogPanel
        objectId="task_1"
        objectKind="task"
        initialEntries={sampleEntries}
        injectedExport={exporter}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('audit-export-json'));
    expect(await screen.findByTestId('audit-export-error')).toHaveTextContent(/boom/);
  });
});
