import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIMemoryPage } from '../AIMemoryPage';
import { buildFact, createInMemoryStore } from '../memoryStore';
import { renderWithProviders } from '../../../test/renderWithProviders';

describe('AIMemoryPage', () => {
  it('renders the on-device privacy banner', async () => {
    const store = createInMemoryStore();
    renderWithProviders(<AIMemoryPage store={store} />);
    await waitFor(() => expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument());
    expect(screen.getByTestId('memory-page-privacy')).toHaveTextContent('On-device');
    expect(screen.getByTestId('memory-page-privacy')).toHaveTextContent('0 B egress');
  });

  it('lists existing facts grouped by kind', async () => {
    const store = createInMemoryStore();
    await store.put(buildFact({ id: 'p1', kind: 'person', text: 'Mira plays soccer' }));
    await store.put(buildFact({ id: 'r1', kind: 'routine', text: 'Trash night Tue' }));
    renderWithProviders(<AIMemoryPage store={store} />);
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-group-person')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('memory-page-group-person')).toHaveTextContent(
      'Mira plays soccer',
    );
    expect(screen.getByTestId('memory-page-group-routine')).toHaveTextContent(
      'Trash night Tue',
    );
  });

  it('adds a fact via the form', async () => {
    const store = createInMemoryStore();
    renderWithProviders(<AIMemoryPage store={store} />);
    await waitFor(() => expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument());
    await userEvent.type(screen.getByTestId('memory-page-text'), 'Likes oat milk');
    await userEvent.selectOptions(screen.getByTestId('memory-page-kind'), 'preference');
    await userEvent.click(screen.getByTestId('memory-page-add-button'));
    await waitFor(() =>
      expect(screen.getByTestId('memory-page-group-preference')).toHaveTextContent(
        'Likes oat milk',
      ),
    );
    const rows = await store.list();
    expect(rows.find((r) => r.text === 'Likes oat milk')).toBeTruthy();
  });

  it('removes a fact', async () => {
    const store = createInMemoryStore();
    await store.put(buildFact({ id: 'a', kind: 'note', text: 'remove me' }));
    renderWithProviders(<AIMemoryPage store={store} />);
    await waitFor(() => expect(screen.getByText('remove me')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('memory-page-remove-a'));
    await waitFor(() => expect(screen.queryByText('remove me')).not.toBeInTheDocument());
    expect(await store.list()).toHaveLength(0);
  });

  it('edits a fact in place', async () => {
    const store = createInMemoryStore();
    await store.put(buildFact({ id: 'a', kind: 'note', text: 'before' }));
    renderWithProviders(<AIMemoryPage store={store} />);
    await waitFor(() => expect(screen.getByText('before')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('memory-page-edit-button-a'));
    const input = screen.getByTestId('memory-page-edit-a');
    await userEvent.clear(input);
    await userEvent.type(input, 'after');
    await userEvent.click(screen.getByTestId('memory-page-save-a'));
    await waitFor(() => expect(screen.getByText('after')).toBeInTheDocument());
    const rows = await store.list();
    expect(rows[0].text).toBe('after');
  });

  it('disables the add button while text is empty', async () => {
    const store = createInMemoryStore();
    renderWithProviders(<AIMemoryPage store={store} />);
    await waitFor(() => expect(screen.getByTestId('memory-page-empty')).toBeInTheDocument());
    expect(screen.getByTestId('memory-page-add-button')).toBeDisabled();
  });
});
