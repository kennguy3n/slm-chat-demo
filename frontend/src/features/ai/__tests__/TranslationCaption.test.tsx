import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
  model: 'bonsai-8b',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

const sampleVi: TranslateResponse = {
  messageId: 'msg_vi_1',
  channelId: 'ch_dm_alice_minh',
  original: 'Chào Alice, tối mai bạn rảnh đi ăn phở không?',
  translated: "Hi Alice, are you free to grab phở tomorrow night?",
  targetLanguage: 'en',
  model: 'bonsai-8b',
  computeLocation: 'on_device',
  dataEgressBytes: 0,
};

describe('TranslationCaption', () => {
  beforeEach(() => {
    vi.mocked(fetchTranslate).mockReset();
  });

  it('renders a two-panel card with original on top, divider, then translation', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" targetLanguage="es" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('translation-body')).toHaveTextContent(
        'Formulario de excursión vence el viernes',
      );
    });
    expect(screen.getByTestId('translation-original')).toHaveTextContent(
      'Field trip form due Friday',
    );
    // Divider is rendered (hr element) — structural separator between panels.
    const card = screen.getByTestId('translation-caption');
    expect(card.querySelector('hr')).not.toBeNull();
    // Bottom panel labels the target language in human-readable form.
    expect(card.textContent).toMatch(/Spanish/);
  });

  it('renders the on-device attribution pill inside the card', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" targetLanguage="es" />,
    );
    const pill = await screen.findByTestId('translation-pill');
    expect(pill).toHaveTextContent(/SLM/);
    expect(pill).toHaveTextContent(/on-device/);
    expect(pill).toHaveTextContent(/bonsai-8b/);
    expect(pill).toHaveTextContent(/0 B/);
  });

  it('handles Vietnamese target language with diacritics intact', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sampleVi);
    renderWithProviders(
      <TranslationCaption messageId="msg_vi_1" targetLanguage="en" />,
    );
    await waitFor(() => screen.getByTestId('translation-body'));
    expect(screen.getByTestId('translation-original')).toHaveTextContent(
      'Chào Alice, tối mai bạn rảnh đi ăn phở không?',
    );
    expect(screen.getByTestId('translation-body')).toHaveTextContent(
      /phở/,
    );
  });

  it('does not fetch when autoFetch=false (card stays hidden)', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sample);
    renderWithProviders(
      <TranslationCaption messageId="msg_fam_1" autoFetch={false} />,
    );
    expect(fetchTranslate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('translation-caption')).toBeNull();
  });

  it('renders a full PrivacyStrip below the card when enabled', async () => {
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

  it('falls back to originalFallback when API response lacks original text', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce({
      ...sample,
      original: '',
    });
    renderWithProviders(
      <TranslationCaption
        messageId="msg_fam_1"
        targetLanguage="es"
        originalFallback="Field trip form due Friday (local)"
      />,
    );
    const original = await screen.findByTestId('translation-original');
    expect(original).toHaveTextContent('Field trip form due Friday (local)');
  });

  it('emphasises the translated panel when the target is the viewer language', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sampleVi);
    renderWithProviders(
      <TranslationCaption
        messageId="msg_minh_2"
        targetLanguage="en"
        preferredLanguage="en"
      />,
    );
    await waitFor(() => screen.getByTestId('translation-body'));
    const card = screen.getByTestId('translation-caption');
    // Translation lands in the viewer's language → translated panel
    // is the primary surface, original drops to secondary.
    expect(card.dataset.emphasis).toBe('translated');
    const translatedPanel = card.querySelector('.translation-card__panel--translated');
    const originalPanel = card.querySelector('.translation-card__panel--original');
    expect(translatedPanel?.className).toMatch(/translation-card__panel--primary/);
    expect(originalPanel?.className).toMatch(/translation-card__panel--secondary/);
  });

  it('emphasises the original panel when the target is the partner language', async () => {
    const outgoing = {
      ...sample,
      messageId: 'msg_alice_to_minh',
      original: 'See you Saturday at noon!',
      translated: 'Hẹn gặp trưa thứ Bảy!',
      targetLanguage: 'vi',
    };
    vi.mocked(fetchTranslate).mockResolvedValueOnce(outgoing);
    renderWithProviders(
      <TranslationCaption
        messageId="msg_alice_to_minh"
        targetLanguage="vi"
        preferredLanguage="en"
      />,
    );
    await waitFor(() => screen.getByTestId('translation-body'));
    const card = screen.getByTestId('translation-caption');
    expect(card.dataset.emphasis).toBe('original');
    const originalPanel = card.querySelector('.translation-card__panel--original');
    const translatedPanel = card.querySelector('.translation-card__panel--translated');
    expect(originalPanel?.className).toMatch(/translation-card__panel--primary/);
    expect(translatedPanel?.className).toMatch(/translation-card__panel--secondary/);
  });

  it('renders language flag labels for Vietnamese ↔ English bubbles', async () => {
    vi.mocked(fetchTranslate).mockResolvedValueOnce(sampleVi);
    renderWithProviders(
      <TranslationCaption
        messageId="msg_minh_2"
        targetLanguage="en"
        preferredLanguage="en"
      />,
    );
    await waitFor(() => screen.getByTestId('translation-body'));
    const card = screen.getByTestId('translation-caption');
    // The translated-side label always reflects the target language
    // (English flag + name).
    expect(card.textContent).toMatch(/English/);
    expect(card.textContent).toMatch(/\u{1F1FA}\u{1F1F8}/u);
    // The original-side label stays as "Original" when the source
    // language is not implied by the props (incoming bubble).
    expect(card.textContent).toMatch(/Original/);
  });
});
