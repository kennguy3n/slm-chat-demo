import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '../../types/chat';
import type { User } from '../../types/workspace';
import { MessageBubble } from './MessageBubble';
import {
  computeTranslationTarget,
  type DetectLanguageFn,
  detectLanguage,
} from './translate-utils';
import { fetchTranslateBatch } from '../../api/aiApi';
import type { TranslateResponse } from '../../types/ai';

interface Props {
  messages: Message[];
  users: Record<string, User>;
  emptyLabel?: string;
  preferredLanguage?: string;
  partnerLanguage?: string;
}

// Key used by TranslationCaption's useQuery. Shared here so the batch
// prefetch below can seed the same cache entries.
function translateQueryKey(messageId: string, targetLanguage: string) {
  return ['translate', messageId, targetLanguage] as const;
}

const detect: DetectLanguageFn = detectLanguage;

export function MessageList({
  messages,
  users,
  emptyLabel = 'No messages yet.',
  preferredLanguage,
  partnerLanguage,
}: Props) {
  const queryClient = useQueryClient();

  // Collect every message that needs translation and dispatch a single
  // batched IPC call. The results are written into the same react-query
  // cache keys that TranslationCaption reads from, so each bubble
  // renders its card without firing its own /api/generate request.
  useEffect(() => {
    if (messages.length === 0) return;
    const pref = preferredLanguage ?? 'en';
    const items: {
      messageId: string;
      channelId: string;
      text: string;
      targetLanguage: string;
    }[] = [];
    for (const m of messages) {
      const target = computeTranslationTarget(m.content, pref, partnerLanguage, detect);
      if (!target) continue;
      const cached = queryClient.getQueryData<TranslateResponse | null>(
        translateQueryKey(m.id, target),
      );
      // `null` is the in-flight sentinel set below; treat it as
      // already-handled so a re-run of this effect (new message
      // arrives, prop identity changes) doesn't kick off a duplicate
      // batch for the same items.
      if (cached !== undefined) continue;
      items.push({
        messageId: m.id,
        channelId: m.channelId,
        text: m.content,
        targetLanguage: target,
      });
    }
    if (items.length === 0) return;
    let cancelled = false;
    // Seed the cache with a pending marker — keeps TranslationCaption's
    // useQuery from also firing while the batch is in flight.
    for (const it of items) {
      queryClient.setQueryData(translateQueryKey(it.messageId, it.targetLanguage), null);
    }
    void fetchTranslateBatch({ items })
      .then((resp) => {
        if (cancelled) return;
        for (const r of resp.results) {
          queryClient.setQueryData(
            translateQueryKey(r.messageId, r.targetLanguage),
            r,
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Clear the pending markers so each TranslationCaption can
        // retry on its own (single-message path).
        for (const it of items) {
          queryClient.removeQueries({
            queryKey: translateQueryKey(it.messageId, it.targetLanguage),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [messages, preferredLanguage, partnerLanguage, queryClient]);

  if (messages.length === 0) {
    return (
      <div className="msg-list msg-list--empty" role="status">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="msg-list" role="log" aria-live="polite">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          sender={users[m.senderId]}
          preferredLanguage={preferredLanguage}
          partnerLanguage={partnerLanguage}
        />
      ))}
    </div>
  );
}
