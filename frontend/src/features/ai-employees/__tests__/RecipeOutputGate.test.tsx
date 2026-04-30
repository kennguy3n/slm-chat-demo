import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { RecipeOutputGate } from '../RecipeOutputGate';
import { AI_EMPLOYEE_RECIPES } from '../recipeCatalog';
import type { RecipeResultEnvelope } from '../RecipeOutputGate';

function okResult(output: unknown): RecipeResultEnvelope {
  return {
    status: 'ok',
    output,
    model: 'bonsai-8b',
    tier: 'local',
    reason: 'Drafted on-device for review.',
  };
}

describe('RecipeOutputGate', () => {
  it('renders the gate with recipe-derived heading and content', () => {
    renderWithProviders(
      <RecipeOutputGate
        recipeId="draft_prd"
        recipe={AI_EMPLOYEE_RECIPES.draft_prd}
        result={okResult({ prompt: '# PRD draft\n\nGoals...', sources: [] })}
        aiEmployeeName="Nina PM AI"
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByTestId('recipe-output-gate')).toBeInTheDocument();
    expect(screen.getByTestId('output-review-content')).toHaveTextContent(/PRD draft/);
    expect(screen.getByTestId('output-review')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/Nina PM AI/),
    );
  });

  it('Accept fires the supplied callback with the (possibly edited) content', async () => {
    const onAccept = vi.fn();
    renderWithProviders(
      <RecipeOutputGate
        recipeId="draft_prd"
        recipe={AI_EMPLOYEE_RECIPES.draft_prd}
        result={okResult({ prompt: 'Initial draft', sources: [] })}
        onAccept={onAccept}
        onDiscard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('output-review-accept'));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    expect(onAccept).toHaveBeenCalledWith('Initial draft');
  });

  it('Edit toggles an editable textarea and Accept persists the edited body', async () => {
    const onAccept = vi.fn();
    renderWithProviders(
      <RecipeOutputGate
        recipeId="draft_prd"
        recipe={AI_EMPLOYEE_RECIPES.draft_prd}
        result={okResult({ prompt: 'Initial draft', sources: [] })}
        onAccept={onAccept}
        onDiscard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('output-review-edit'));
    const editor = await screen.findByTestId('output-review-editor');
    fireEvent.change(editor, { target: { value: 'Edited draft' } });
    fireEvent.click(screen.getByTestId('output-review-accept'));

    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    expect(onAccept).toHaveBeenCalledWith('Edited draft');
  });

  it('Discard fires onDiscard without calling onAccept', () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <RecipeOutputGate
        recipeId="draft_prd"
        recipe={AI_EMPLOYEE_RECIPES.draft_prd}
        result={okResult({ prompt: 'Initial draft', sources: [] })}
        onAccept={onAccept}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByTestId('output-review-discard'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('hides the Edit button for recipes configured with allowEdit=false', () => {
    renderWithProviders(
      <RecipeOutputGate
        recipeId="prefill_approval"
        recipe={AI_EMPLOYEE_RECIPES.prefill_approval}
        result={okResult({
          vendor: 'Acme',
          amount: '$5,000',
          risk: 'low',
          justification: 'Covered in vendor RFQ thread',
          fields: {},
          sourceMessageIds: ['m1', 'm2'],
          templateId: 'vendor',
          title: 'Acme vendor onboarding',
        })}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('output-review-edit')).toBeNull();
    expect(screen.getByTestId('output-review-content')).toHaveTextContent(/Vendor: Acme/);
  });

  it('formats extract_tasks output as a numbered list', () => {
    renderWithProviders(
      <RecipeOutputGate
        recipeId="extract_tasks"
        recipe={AI_EMPLOYEE_RECIPES.extract_tasks}
        result={okResult({
          tasks: [
            { title: 'Ship preview', owner: 'alice', dueDate: '2026-05-01' },
            { title: 'File RFC' },
          ],
        })}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const content = screen.getByTestId('output-review-content');
    expect(content).toHaveTextContent(/1\. Ship preview/);
    expect(content).toHaveTextContent(/owner: alice/);
    expect(content).toHaveTextContent(/2\. File RFC/);
  });

  it('shows a refusal banner when the recipe was refused', () => {
    const onDiscard = vi.fn();
    renderWithProviders(
      <RecipeOutputGate
        recipeId="draft_prd"
        recipe={AI_EMPLOYEE_RECIPES.draft_prd}
        result={{
          status: 'refused',
          output: null,
          model: '',
          tier: 'local',
          reason: 'draft_prd: thread is empty; refusing to draft a PRD.',
        }}
        onAccept={vi.fn()}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByTestId('recipe-output-gate-refused')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/refusing to draft a PRD/);
    fireEvent.click(screen.getByTestId('recipe-output-gate-dismiss'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('exposes recipe sources in the OutputReview sources section', () => {
    renderWithProviders(
      <RecipeOutputGate
        recipeId="draft_prd"
        recipe={AI_EMPLOYEE_RECIPES.draft_prd}
        result={okResult({
          prompt: 'draft',
          sources: [
            { id: 'm1', sender: 'Alice', excerpt: 'Goal: ship by Q3' },
            { id: 'm2', sender: 'Bob', excerpt: 'Risks are tight timelines' },
          ],
        })}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByTestId('output-review-sources')).toBeInTheDocument();
    expect(screen.getByTestId('output-review-source-m1')).toHaveTextContent(
      /Alice: Goal: ship by Q3/,
    );
  });
});
