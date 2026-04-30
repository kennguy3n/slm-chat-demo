// Shared language-detection + translation-target logic used by both
// the MessageBubble (renders the per-message card) and the MessageList
// (batches a single IPC call for every visible bubble).

// Vietnamese-specific diacritics.
const VI_DIACRITICS = /[ăâđêôơưẢạảấầẩẫậắằẳẵặẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáãèéìíòóõùúýĂÂĐÊÔƠƯ]/;
// Spanish-specific characters (ñ, inverted punctuation, accented vowels).
const ES_DIACRITICS = /[ñÑ¿¡]|[áéíóúÁÉÍÓÚ]/;
// CJK unified ideographs (Chinese / Japanese kanji), kana, hangul.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

export type DetectLanguageFn = (text: string) => string;

// Detect the most-likely ISO-639-1 source language of a message. The
// check is intentionally coarse — it just needs to decide whether the
// bubble should auto-render a translation card.
export function detectLanguage(text: string): string {
  if (VI_DIACRITICS.test(text)) return 'vi';
  if (CJK.test(text)) return 'zh';
  if (ES_DIACRITICS.test(text)) return 'es';
  return 'en';
}

// computeTranslationTarget returns the language code a message should
// be translated into, or null when no card should render. In bilingual
// channels messages in the viewer's preferred language translate into
// the partner language and vice versa.
export function computeTranslationTarget(
  content: string,
  preferredLanguage: string,
  partnerLanguage: string | undefined,
  detect: DetectLanguageFn = detectLanguage,
): string | null {
  const trimmed = content.trim();
  if (trimmed.length <= 1) return null;
  const source = detect(content);
  if (source !== preferredLanguage) return preferredLanguage;
  if (partnerLanguage && partnerLanguage !== preferredLanguage) return partnerLanguage;
  return null;
}
