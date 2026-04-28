import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranslationCaption } from '../TranslationCaption';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { TranslateResponse } from '../../../types/ai';

vi.mock('../../../api/aiApi', () => ({
  fetchTranslate: vi.fn(),
  fetchModelStatus: vi.fn(),
  fetchEgressPreview: vi.fn(),
}));

import { fetchTranslate } from '../../../api/aiApi';

const sample: TranslateResponse = {
  messageId: 'msg_fam_1',
  channelId: 'ch_family',
  original: 'Field trip form due Friday',
  translated: 'Formulario de excursión vence el viernes',
  targetLanguage: 'es',
  model: 'gemma-4-e2b',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('TranslationCaption', () => {
  beforeEach(() => {
    vi.mocked(fetchTranslate).mockReset();
  });

  it('renders the translated text when autoFetch=true', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" targetLanguage="es" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-body')).toHaveTextContent(
        'Formulario de excursión vence el viernes',
      );
    });
  });

  it('toggles between translated and original when the user taps the toggle', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" targetLanguage="es" />,
    );
    await waitFor(() => screen.getByTestId('translation-toggle'));
    await userEvent.click(screen.getByTestId('translation-toggle'));
    expect(screen.getByTestId('translation-body')).toHaveTextContent(
      'Field trip form due Friday',
    );
    await userEvent.click(screen.getByTestId('translation-toggle'));
    expect(screen.getByTestId('translation-body')).toHaveTextContent(
      'Formulario de excursión vence el viernes',
    );
  });

  it('only fetches after the user clicks Translate when autoFetch=false', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" autoFetch={false} />,
    );
    expect(fetchTranslate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('translation-trigger'));
    await waitFor(() => screen.getByTestId('translation-body'));
    expect(fetchTranslate).toHaveBeenCalledOnce();
  });

  it('renders a PrivacyStrip with on-device / 0 egress when enabled', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" targetLanguage="es" showPrivacyStrip />,
    );
    await waitFor(() => screen.getByTestId('privacy-compute'));
    expect(screen.getByTestId('privacy-compute')).toHaveTextContent('On-device');
    expect(screen.getByTestId('privacy-egress')).toHaveTextContent('0 B');
  });

  it('renders an error when the translation request fails', async () => {
    vi.mocked(fetchTranslate).mockRejectedValueOnce(new Error('network down'));
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" targetLanguage="es" />,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network down/i);
    });
  });
});
