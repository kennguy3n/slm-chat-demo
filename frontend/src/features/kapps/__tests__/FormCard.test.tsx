import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormCard } from '../FormCard';
import type { Form, FormFieldDef } from '../../../types/kapps';

const fields: FormFieldDef[] = [
  { name: 'vendor', label: 'Vendor', required: true },
  { name: 'amount', label: 'Amount', required: true },
  { name: 'compliance', label: 'Compliance' },
];

function makeForm(overrides: Partial<Form> = {}): Form {
  return {
    id: 'frm_1',
    channelId: 'ch_x',
    templateId: 'vendor_onboarding_v1',
    title: 'Vendor onboarding',
    fields: { vendor: 'Acme', amount: '$10' },
    sourceThreadId: 'thr_1',
    status: 'draft',
    aiGenerated: true,
    ...overrides,
  };
}

describe('FormCard', () => {
  it('renders the form fields with prefilled values and an AI badge', () => {
    render(
      <FormCard
        form={makeForm()}
        templateFields={fields}
        aiPrefilledFieldNames={['vendor', 'amount']}
      />,
    );
    expect(screen.getByTestId('form-card-ai-badge')).toBeInTheDocument();
    expect(screen.getByTestId('form-card-input-vendor')).toHaveValue('Acme');
    expect(screen.getByTestId('form-card-input-amount')).toHaveValue('$10');
    expect(
      screen.getByTestId('form-card-field-vendor').getAttribute('data-ai'),
    ).toBe('true');
    expect(
      screen.getByTestId('form-card-field-compliance').getAttribute('data-ai'),
    ).toBe(null);
  });

  it('blocks submit when a required field is empty and surfaces an alert', async () => {
    render(
      <FormCard
        form={makeForm({ fields: { vendor: 'Acme', amount: '' } })}
        templateFields={fields}
      />,
    );
    await userEvent.click(screen.getByTestId('form-card-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/amount/i);
  });

  it('calls onSubmit with the latest field values, including user edits', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormCard
        form={makeForm()}
        templateFields={fields}
        aiPrefilledFieldNames={['vendor', 'amount']}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.clear(screen.getByTestId('form-card-input-amount'));
    await userEvent.type(screen.getByTestId('form-card-input-amount'), '$99');
    await userEvent.type(screen.getByTestId('form-card-input-compliance'), 'SOC 2');
    await userEvent.click(screen.getByTestId('form-card-submit'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'Acme', amount: '$99', compliance: 'SOC 2' }),
    );
  });

  it('calls onDiscard when the discard button is clicked', async () => {
    const onDiscard = vi.fn();
    render(
      <FormCard
        form={makeForm()}
        templateFields={fields}
        aiPrefilledFieldNames={['vendor']}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByTestId('form-card-discard'));
    expect(onDiscard).toHaveBeenCalled();
  });
});
