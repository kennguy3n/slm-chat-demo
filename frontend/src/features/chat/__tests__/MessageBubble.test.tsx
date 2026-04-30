import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { MessageBubble } from '../MessageBubble';
import type { Message } from '../../../types/chat';
import type { User } from '../../../types/workspace';
import type { TranslateResponse } from '../../../types/ai';

vi.mock('../../../api/aiApi', () => ({
  fetchTranslate: vi.fn(),
  fetchModelStatus: vi.fn(),
  fetchEgressPreview: vi.fn(),
}));

import { fetchTranslate } from '../../../api/aiApi';

const alice: User = {
  id: 'user_alice',
  displayName: 'Alice Chen',
  email: 'a@x',
  avatarColor: '#7c3aed',
};

const minh: User = {
  id: 'user_minh',
  displayName: 'Minh Nguyen',
  email: 'm@x',
  avatarColor: '#0ea5e9',
};

const incoming: Message = {
  id: 'msg_minh_2',
  channelId: 'ch_dm_alice_minh',
  senderId: 'user_minh',
  content:
    'Chào Alice! Thứ Bảy này mình rảnh. Nhà hàng nào vậy? Mình nghe nói có một quán phở mới mở ở trung tâm.',
  createdAt: '2026-04-28T08:00:00Z',
};

const outgoing: Message = {
  id: 'msg_minh_3',
  channelId: 'ch_dm_alice_minh',
  senderId: 'user_alice',
  content: "Yes! That's the one. I heard their pho is amazing. Want to meet around noon?",
  createdAt: '2026-04-28T08:01:00Z',
};

describe('MessageBubble (bilingual channel)', () => {
  beforeEach(() => {
    vi.mocked(fetchTranslate).mockReset();
  });

  it('renders a TranslationCaption when partnerLanguage is set and source is foreign', async () => {
    const resp: TranslateResponse = {
      messageId: incoming.id,
      channelId: incoming.channelId,
      original: incoming.content,
      translated: "Hi Alice! I'm free this Saturday. Which restaurant?",
      targetLanguage: 'en',
      model: 'bonsai-8b',
      computeLocation: 'on_device',
      dataEgressBytes: 0,
    };
    vi.mocked(fetchTranslate).mockResolvedValueOnce(resp);
    renderWithProviders(
      <MessageBubble
        message={incoming}
        sender={minh}
        preferredLanguage="en"
        partnerLanguage="vi"
      />,
    );
    // Wait until the response has resolved and the emphasis attr
    // has flipped from the loading-state span to the rendered card.
    await waitFor(() => {
      const card = screen.getByTestId('translation-caption');
      expect(card.dataset.emphasis).toBe('translated');
    });
  });

  it('renders a TranslationCaption for outgoing English messages too (translated INTO Vietnamese for the partner)', async () => {
    const resp: TranslateResponse = {
      messageId: outgoing.id,
      channelId: outgoing.channelId,
      original: outgoing.content,
      translated:
        'Đúng quán đó luôn! Mình nghe nói phở ở đó rất ngon. Hẹn nhau khoảng buổi trưa nhé?',
      targetLanguage: 'vi',
      model: 'bonsai-8b',
      computeLocation: 'on_device',
      dataEgressBytes: 0,
    };
    vi.mocked(fetchTranslate).mockResolvedValueOnce(resp);
    renderWithProviders(
      <MessageBubble
        message={outgoing}
        sender={alice}
        preferredLanguage="en"
        partnerLanguage="vi"
      />,
    );
    await waitFor(() => {
      const card = screen.getByTestId('translation-caption');
      expect(card.dataset.emphasis).toBe('original');
    });
  });

  it('does not render a TranslationCaption when there is no partnerLanguage and the message is already in the viewer language', () => {
    renderWithProviders(
      <MessageBubble
        message={outgoing}
        sender={alice}
        preferredLanguage="en"
      />,
    );
    expect(screen.queryByTestId('translation-caption')).toBeNull();
    // The plain bubble content still renders as a normal message.
    expect(screen.getByText(outgoing.content)).toBeInTheDocument();
  });
});
