import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivacyStrip } from '../PrivacyStrip';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { PrivacyStripData } from '../../../types/ai';

const data: PrivacyStripData = {
  computeLocation: 'on_device',
  modelName: 'gemma-4-e2b',
  sources: [
    { kind: 'thread', id: 'msg_eng_root', label: 'Engineering thread' },
    { kind: 'message', id: 'msg_eng_2', label: 'Reply from Bob' },
  ],
  dataEgressBytes: 0,
  confidence: 0.86,
  missingInfo: ['locale'],
  whySuggested: 'Detected an action item with a clear owner and due date.',
  origin: { kind: 'thread', id: 'msg_eng_root', label: 'Engineering thread' },
};

describe('PrivacyStrip', () => {
  it('renders all 8 required AI UI elements', () => {
    renderWithProviders(<PrivacyStrip data={data} />);
    // 1. compute location
    expect(screen.getByTestId('privacy-compute')).toHaveTextContent('On-device');
    // 2. model name
    expect(screen.getByTestId('privacy-model')).toHaveTextContent('gemma-4-e2b');
    // 3. sources used
    const sources = screen.getByTestId('privacy-sources');
    expect(sources).toHaveTextContent('Engineering thread');
    expect(sources).toHaveTextContent('Reply from Bob');
    // 4. data egress
    expect(screen.getByTestId('privacy-egress')).toHaveTextContent('0 B');
    // 5. confidence + missing info
    expect(screen.getByTestId('privacy-confidence')).toHaveTextContent('86%');
    expect(screen.getByTestId('privacy-confidence')).toHaveTextContent('locale');
    // 6. why suggested
    expect(screen.getByTestId('privacy-why')).toHaveTextContent(/clear owner and due date/i);
    // 7. accept / edit / discard
    expect(screen.getByTestId('privacy-accept')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-edit')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-discard')).toBeInTheDocument();
    // 8. linked origin
    expect(screen.getByTestId('privacy-origin')).toHaveTextContent('Engineering thread');
  });

  it('shows an empty-source label when no sources are used', () => {
    renderWithProviders(<PrivacyStrip data={{ ...data, sources: [] }} />);
    expect(screen.getByText(/no external sources used/i)).toBeInTheDocument();
  });

  it('fires accept / edit / discard callbacks', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <PrivacyStrip data={data} onAccept={onAccept} onEdit={onEdit} onDiscard={onDiscard} />,
    );
    await userEvent.click(screen.getByTestId('privacy-accept'));
    await userEvent.click(screen.getByTestId('privacy-edit'));
    await userEvent.click(screen.getByTestId('privacy-discard'));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('renders "unknown" confidence when omitted', () => {
    renderWithProviders(<PrivacyStrip data={{ ...data, confidence: undefined }} />);
    expect(screen.getByTestId('privacy-confidence')).toHaveTextContent('unknown');
  });

  it('formats non-zero egress', () => {
    renderWithProviders(<PrivacyStrip data={{ ...data, dataEgressBytes: 2048 }} />);
    expect(screen.getByTestId('privacy-egress')).toHaveTextContent('2.0 KB');
  });

  it('expands "Why?" details on click and renders source links', async () => {
    const withDetails: PrivacyStripData = {
      ...data,
      whyDetails: [
        { signal: 'Owner mentioned: Mei' },
        { signal: 'Source message', sourceId: 'msg_eng_2', sourceLabel: 'Reply from Bob' },
      ],
    };
    renderWithProviders(<PrivacyStrip data={withDetails} />);
    expect(screen.queryByTestId('privacy-why-details')).toBeNull();
    const toggle = screen.getByTestId('privacy-why-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByTestId('privacy-why-details');
    expect(details).toHaveTextContent('Owner mentioned: Mei');
    expect(details).toHaveTextContent('Reply from Bob');
    const link = details.querySelector('a');
    expect(link).toHaveAttribute('href', '#message-msg_eng_2');
  });

  it('hides the why-details toggle when no details are supplied', () => {
    renderWithProviders(<PrivacyStrip data={data} />);
    expect(screen.queryByTestId('privacy-why-toggle')).toBeNull();
  });
});
