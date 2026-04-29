import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutputReview, type OutputReviewSource } from '../OutputReview';
import { renderWithProviders as render } from '../../../test/renderWithProviders';

const sources: OutputReviewSource[] = [
  { id: 'msg_1', label: 'Alice', excerpt: 'We need a Q4 vendor refresh.' },
  { id: 'msg_2', label: 'Bob', excerpt: 'Budget is $50k.' },
];

describe('OutputReview', () => {
  it('calls onAccept with the original content when Accept is clicked', async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    render(
      <OutputReview
        objectKind="artifact"
        content="Draft body"
        sources={sources}
        onAccept={onAccept}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByTestId('output-review-accept'));
    expect(onAccept).toHaveBeenCalledWith('Draft body');
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('lets the user edit content and accept the edited version', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    render(
      <OutputReview
        objectKind="artifact"
        content="Original body"
        sources={[]}
        onAccept={onAccept}
        onEdit={onEdit}
        onDiscard={() => undefined}
      />,
    );
    await userEvent.click(screen.getByTestId('output-review-edit'));
    const editor = await screen.findByTestId('output-review-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Edited body');
    await userEvent.click(screen.getByTestId('output-review-accept'));
    expect(onAccept).toHaveBeenCalledWith('Edited body');
  });

  it('preserves edits when the user clicks Save edits before Accept', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    render(
      <OutputReview
        objectKind="artifact"
        content="Original body"
        sources={[]}
        onAccept={onAccept}
        onEdit={onEdit}
        onDiscard={() => undefined}
      />,
    );
    await userEvent.click(screen.getByTestId('output-review-edit'));
    const editor = await screen.findByTestId('output-review-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Edited then saved');
    // First click on the Edit button entered edit mode; the second click
    // is the "Save edits" action — it fires onEdit and exits edit mode.
    await userEvent.click(screen.getByTestId('output-review-edit'));
    expect(onEdit).toHaveBeenCalledWith('Edited then saved');
    // The read-only body must show the edited draft, not the original
    // prop value, otherwise the displayed and submitted content diverge.
    expect(screen.getByTestId('output-review-content')).toHaveTextContent(
      'Edited then saved',
    );
    expect(screen.getByTestId('output-review-content')).not.toHaveTextContent(
      'Original body',
    );
    await userEvent.click(screen.getByTestId('output-review-accept'));
    // Accept must use the edited draft, not the original content, even
    // though the edit-mode flag has been toggled back to false.
    expect(onAccept).toHaveBeenCalledWith('Edited then saved');
  });

  it('calls onDiscard when Discard is clicked', async () => {
    const onDiscard = vi.fn();
    render(
      <OutputReview
        objectKind="task"
        content="Will be discarded"
        sources={[]}
        onAccept={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByTestId('output-review-discard'));
    expect(onDiscard).toHaveBeenCalled();
  });

  it('renders source pins with their excerpts', () => {
    render(
      <OutputReview
        objectKind="artifact"
        content="Body"
        sources={sources}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sources \(2\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('output-review-source-msg_1')).toHaveTextContent('Alice');
    expect(screen.getByTestId('output-review-source-msg_1')).toHaveTextContent(
      'We need a Q4 vendor refresh.',
    );
    expect(screen.getByTestId('output-review-source-msg_2')).toHaveTextContent('Bob');
  });

  it('renders a privacy strip with on-device defaults', () => {
    render(
      <OutputReview
        objectKind="approval"
        content="Body"
        sources={[]}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    // The PrivacyStrip renders the on-device label and the model name.
    expect(screen.getAllByText(/On-device/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/gemma-4-e4b/i).length).toBeGreaterThan(0);
  });

  it('hides the Edit button when allowEdit={false} (status-confirmation flow)', () => {
    render(
      <OutputReview
        objectKind="artifact-status"
        targetStatus="published"
        content="Locked body"
        sources={[]}
        allowEdit={false}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('output-review-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('output-review-accept')).toBeInTheDocument();
  });

  it('uses a status-specific Accept label when targetStatus is supplied', () => {
    render(
      <OutputReview
        objectKind="artifact-status"
        targetStatus="published"
        content="Body"
        sources={[]}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByTestId('output-review-accept')).toHaveTextContent(/Confirm published/i);
  });
});
