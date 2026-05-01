import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuardrailRewriteCard } from '../GuardrailRewriteCard';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type {
  GuardrailRewriteResult,
  SkillPrivacy,
} from '../../../types/electron';

const privacy: SkillPrivacy = {
  computeLocation: 'on_device',
  modelName: 'bonsai-1.7b',
  tier: 'local',
  reason: 'Routed guardrail review to on-device Bonsai-1.7B.',
  dataEgressBytes: 0,
  sources: [],
};

describe('GuardrailRewriteCard', () => {
  it('returns null when result.safe is true', () => {
    const result: GuardrailRewriteResult = {
      safe: true,
      findings: [],
      rationale: 'Looks fine.',
    };
    const { container } = renderWithProviders(
      <GuardrailRewriteCard
        original="Hi"
        result={result}
        privacy={privacy}
        onAccept={() => {}}
        onKeep={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="guardrail-rewrite-card"]')).toBeNull();
  });

  it('renders findings, rewrite, and accept/keep/edit actions', async () => {
    const result: GuardrailRewriteResult = {
      safe: false,
      findings: [
        { category: 'pii', excerpt: '415-555-1234', reason: 'phone number', source: 'regex' },
      ],
      rewrite: 'Please call me later.',
      rationale: 'Stripped a phone number.',
    };
    const onAccept = vi.fn();
    const onKeep = vi.fn();
    const onEdit = vi.fn();
    renderWithProviders(
      <GuardrailRewriteCard
        original="Call me at 415-555-1234"
        result={result}
        privacy={privacy}
        onAccept={onAccept}
        onKeep={onKeep}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByTestId('guardrail-rewrite-original')).toHaveTextContent(
      'Call me at 415-555-1234',
    );
    expect(screen.getByTestId('guardrail-rewrite-suggestion')).toHaveTextContent(
      'Please call me later.',
    );
    expect(screen.getByTestId('guardrail-rewrite-findings')).toHaveTextContent('phone number');

    await userEvent.click(screen.getByTestId('guardrail-rewrite-accept'));
    expect(onAccept).toHaveBeenCalledWith('Please call me later.');

    await userEvent.click(screen.getByTestId('guardrail-rewrite-keep'));
    expect(onKeep).toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('guardrail-rewrite-edit'));
    expect(onEdit).toHaveBeenCalled();
  });
});
