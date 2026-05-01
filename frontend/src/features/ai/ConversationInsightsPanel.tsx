import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchConversationInsights } from '../../api/aiApi';
import type {
  ConversationInsightsResponse,
  ConversationSentiment,
} from '../../types/ai';
import type { Channel, User } from '../../types/workspace';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  channel?: Channel | null;
  // Reserved — the viewer-language hint can be derived from the
  // workspace user map. Today we default to English on the
  // assumption Alice is the viewer.
  users?: Record<string, User>;
}

const CACHE_KEY_PREFIX = 'conversation-insights' as const;

function cacheKeyFor(channel: Channel | null | undefined) {
  return [CACHE_KEY_PREFIX, channel?.id ?? null] as const;
}

// Cached payload for a channel's insights. We pin the original
// `generatedAt` alongside the LLM output so a tab/channel switch
// re-renders the same "Updated …" timestamp the user saw before
// instead of either:
//   • bleeding the previous channel's timestamp into the new view
//     (when state still holds it from a prior run), or
//   • dropping the timestamp entirely when the prior view never
//     completed and `generatedAt` is null.
interface InsightsCache {
  insights: ConversationInsightsResponse;
  generatedAt: string;
}

const SENTIMENT_LABEL: Record<ConversationSentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  mixed: 'Mixed',
  unknown: 'Unknown',
};

// ConversationInsightsPanel is the right-rail "Insights" tab in the
// 2026-05-01 ground-zero LLM redesign of the B2C surface. On demand
// the panel calls the on-device LLM (via `ai:conversation-insights`
// → router → OllamaAdapter → Bonsai) and renders a structured view
// of the chat: top topics, action items, decisions, and the
// conversation's overall sentiment with a one-sentence rationale.
//
// Every list item is the LLM's output, not seed data. The privacy
// strip at the bottom advertises the compute location, the model
// name, and the egress byte count so the operator can confirm the
// panel really did run locally.
export function ConversationInsightsPanel({ channel = null }: Props) {
  const queryClient = useQueryClient();
  const cacheKey = cacheKeyFor(channel);
  const cached = queryClient.getQueryData<InsightsCache>(cacheKey) ?? null;

  const [insights, setInsights] = useState<ConversationInsightsResponse | null>(
    cached?.insights ?? null,
  );
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    cached ? new Date(cached.generatedAt) : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startedRef = useRef<string | null>(null);
  const runIdRef = useRef(0);

  function run() {
    if (!channel) return;
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    setErr(null);
    setIsLoading(true);
    void fetchConversationInsights({
      channelId: channel.id,
      // Bilingual DM hints English as the viewer language. Other
      // channels currently default to English too.
      viewerLanguage: 'English',
    })
      .then((data) => {
        if (runIdRef.current !== myRunId) return;
        const now = new Date();
        setInsights(data);
        setGeneratedAt(now);
        queryClient.setQueryData<InsightsCache>(cacheKey, {
          insights: data,
          generatedAt: now.toISOString(),
        });
        setIsLoading(false);
      })
      .catch((e: unknown) => {
        if (runIdRef.current !== myRunId) return;
        setErr(e instanceof Error ? e.message : String(e));
        setIsLoading(false);
      });
  }

  // Auto-run on first selection of a channel that hasn't been
  // analysed yet. Subsequent visits replay the cached insights.
  useEffect(() => {
    if (!channel) return;
    if (startedRef.current === channel.id) return;
    startedRef.current = channel.id;
    if (cached) {
      // Switching to a channel with cached output — bump the run id so any
      // in-flight fetch from the previously selected channel is dropped
      // by its own resolved/rejected handler instead of overwriting state.
      // Restore the cached `generatedAt` too, so the "Updated …" label
      // matches the actual moment that channel's insights were produced
      // — not "now" and not the previous channel's timestamp.
      runIdRef.current += 1;
      setInsights(cached.insights);
      setGeneratedAt(new Date(cached.generatedAt));
      setIsLoading(false);
      setErr(null);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const showInsights = !!insights && !isLoading;

  return (
    <section
      className="conversation-insights-panel"
      aria-label="Conversation insights"
      data-testid="conversation-insights-panel"
    >
      <header className="conversation-insights-panel__header">
        <h2 className="conversation-insights-panel__title">Conversation insights</h2>
        <p className="conversation-insights-panel__subtitle">
          Topics, action items, decisions, and tone — extracted on-device by the LLM.
        </p>
        <button
          type="button"
          className="conversation-insights-panel__run"
          data-testid="conversation-insights-run"
          onClick={run}
          disabled={!channel || isLoading}
        >
          {isLoading
            ? 'Analysing…'
            : insights
              ? 'Refresh insights'
              : 'Generate insights'}
        </button>
        {generatedAt && !isLoading && (
          <span
            className="conversation-insights-panel__timestamp"
            data-testid="conversation-insights-timestamp"
          >
            Updated {generatedAt.toLocaleTimeString()}
          </span>
        )}
      </header>

      {err && (
        <div role="alert" className="conversation-insights-panel__error">
          Insights failed: {err}
        </div>
      )}

      {!channel && !err && (
        <p className="conversation-insights-panel__empty">
          Select a chat to see on-device LLM insights.
        </p>
      )}

      {showInsights && insights && (
        <div className="conversation-insights-panel__body">
          <Section
            label="Topics"
            testid="conversation-insights-topics"
            empty="No topics yet."
            count={insights.topics.length}
          >
            {insights.topics.map((t, i) => (
              <li
                key={`${t.label}-${i}`}
                className="conversation-insights-panel__row"
                data-testid="conversation-insights-topic"
              >
                <span className="conversation-insights-panel__row-label">{t.label}</span>
                {t.detail && (
                  <span className="conversation-insights-panel__row-detail">{t.detail}</span>
                )}
              </li>
            ))}
          </Section>

          <Section
            label="Action items"
            testid="conversation-insights-actions"
            empty="No action items yet."
            count={insights.actionItems.length}
          >
            {insights.actionItems.map((a, i) => (
              <li
                key={`${a.text}-${i}`}
                className="conversation-insights-panel__row"
                data-testid="conversation-insights-action"
              >
                {a.owner && (
                  <span className="conversation-insights-panel__row-owner">{a.owner}</span>
                )}
                <span className="conversation-insights-panel__row-label">{a.text}</span>
              </li>
            ))}
          </Section>

          <Section
            label="Decisions"
            testid="conversation-insights-decisions"
            empty="No decisions captured."
            count={insights.decisions.length}
          >
            {insights.decisions.map((d, i) => (
              <li
                key={`${d.text}-${i}`}
                className="conversation-insights-panel__row"
                data-testid="conversation-insights-decision"
              >
                <span className="conversation-insights-panel__row-label">{d.text}</span>
              </li>
            ))}
          </Section>

          <div
            className="conversation-insights-panel__sentiment"
            data-testid="conversation-insights-sentiment"
          >
            <span className="conversation-insights-panel__sentiment-label">Sentiment</span>
            <span
              className={`conversation-insights-panel__sentiment-value conversation-insights-panel__sentiment-value--${insights.sentiment}`}
              data-testid={`conversation-insights-sentiment-${insights.sentiment}`}
            >
              {SENTIMENT_LABEL[insights.sentiment]}
            </span>
            {insights.sentimentRationale && (
              <span className="conversation-insights-panel__sentiment-rationale">
                {insights.sentimentRationale}
              </span>
            )}
          </div>

          <PrivacyStrip
            data={{
              computeLocation: insights.computeLocation,
              modelName: insights.model,
              sources: insights.sourceMessageIds.map((id) => ({
                kind: 'message' as const,
                id,
                label: id,
              })),
              dataEgressBytes: insights.dataEgressBytes,
              confidence: 0.78,
              whySuggested:
                'On-device LLM extracted topics, action items, decisions, and tone from the recent conversation.',
              whyDetails: [
                { signal: `${insights.topics.length} topic(s) extracted` },
                { signal: `${insights.actionItems.length} action item(s)` },
                { signal: `${insights.decisions.length} decision(s)` },
                { signal: `Sentiment: ${SENTIMENT_LABEL[insights.sentiment]}` },
                { signal: 'Runs on-device only' },
              ],
              origin: {
                kind: 'thread',
                id: insights.channelId,
                label: channel?.name ?? insights.channelId,
              },
            }}
          />
        </div>
      )}
    </section>
  );
}

interface SectionProps {
  label: string;
  testid: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}

function Section({ label, testid, empty, count, children }: SectionProps) {
  return (
    <div className="conversation-insights-panel__section" data-testid={testid}>
      <h3 className="conversation-insights-panel__section-title">{label}</h3>
      {count === 0 ? (
        <p className="conversation-insights-panel__empty">{empty}</p>
      ) : (
        <ul className="conversation-insights-panel__list">{children}</ul>
      )}
    </div>
  );
}
