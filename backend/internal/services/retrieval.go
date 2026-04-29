package services

import (
	"sort"
	"strings"
	"unicode"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// RetrievalService is the Phase 5 per-channel keyword retrieval
// index. It chunks every message in a channel plus the excerpts of
// every connector file attached to that channel, then scores chunks
// against a free-form query using simple term-overlap matching.
//
// Phase 5 deliberately ships a keyword scorer rather than real
// embeddings — `RetrievalChunk.Embedding` is reserved for a future
// phase that swaps in on-device vector embeddings without changing
// the schema, the API, or the renderer integration.
type RetrievalService struct {
	store *store.Memory
}

// NewRetrievalService constructs the service.
func NewRetrievalService(s *store.Memory) *RetrievalService {
	return &RetrievalService{store: s}
}

// IndexChannel rebuilds the retrieval index for a single channel.
// Every existing chunk for the channel is dropped, then one chunk is
// inserted per message in the channel and one per connector file
// excerpt accessible from the channel.
//
// Phase 5+: connector files are skipped when the requesting user is
// not in the file's ACL. Empty ACL falls open so unsynced demo files
// continue to flow. Pass an empty `userID` to opt out of the ACL
// gate (for unit-tests or background system jobs).
//
// Returns ErrNotFound if the channel does not exist so handlers can
// surface a 404.
func (s *RetrievalService) IndexChannel(channelID, userID string) (int, error) {
	if _, ok := s.store.GetChannel(channelID); !ok {
		return 0, ErrNotFound
	}
	s.store.ClearChannelChunks(channelID)
	chunks := []models.RetrievalChunk{}
	for _, msg := range s.store.ListAllChannelMessages(channelID) {
		body := strings.TrimSpace(msg.Content)
		if body == "" {
			continue
		}
		chunks = append(chunks, models.RetrievalChunk{
			ID:         "chunk_msg_" + msg.ID,
			ChannelID:  channelID,
			SourceKind: models.RetrievalSourceKindMessage,
			SourceID:   msg.ID,
			Content:    body,
		})
	}
	for _, f := range s.store.ListConnectorFilesByChannel(channelID) {
		if userID != "" && !fileACLAllows(f, userID) {
			continue
		}
		body := strings.TrimSpace(f.Excerpt)
		if body == "" {
			continue
		}
		chunks = append(chunks, models.RetrievalChunk{
			ID:         "chunk_file_" + f.ID,
			ChannelID:  channelID,
			SourceKind: models.RetrievalSourceKindFile,
			SourceID:   f.ID,
			Content:    body,
		})
	}
	s.store.AppendChunks(chunks)
	return len(chunks), nil
}

// Search returns the top-K chunks ranked by term-overlap score for
// `query` within `channelID`. Returns ErrNotFound if the channel does
// not exist. Empty queries return an empty slice. File-backed chunks
// the requesting user is not allowed to see (per the file's ACL) are
// filtered out post-scoring. Pass an empty `userID` to bypass the
// ACL gate.
func (s *RetrievalService) Search(channelID, query, userID string, topK int) ([]models.RetrievalResult, error) {
	if _, ok := s.store.GetChannel(channelID); !ok {
		return nil, ErrNotFound
	}
	terms := tokenize(query)
	if len(terms) == 0 {
		return []models.RetrievalResult{}, nil
	}
	if topK <= 0 {
		topK = 5
	}
	chunks := s.store.ListChunksByChannel(channelID)
	results := make([]models.RetrievalResult, 0, len(chunks))
	for _, c := range chunks {
		if userID != "" && c.SourceKind == models.RetrievalSourceKindFile {
			if f, ok := s.store.GetConnectorFile(c.SourceID); ok && !fileACLAllows(f, userID) {
				continue
			}
		}
		score := scoreChunk(c.Content, terms)
		if score <= 0 {
			continue
		}
		results = append(results, models.RetrievalResult{Chunk: c, Score: score})
	}
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Score != results[j].Score {
			return results[i].Score > results[j].Score
		}
		// Stable secondary sort by chunk ID so ties are deterministic.
		return results[i].Chunk.ID < results[j].Chunk.ID
	})
	if len(results) > topK {
		results = results[:topK]
	}
	return results, nil
}

// tokenize lower-cases `text`, splits on non-letter / non-digit
// boundaries, and drops single-character tokens. The result is a flat
// list of terms used for both indexing-time content tokenisation and
// query-time matching.
func tokenize(text string) []string {
	out := []string{}
	for _, field := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		if len(field) <= 1 {
			continue
		}
		if isStopword(field) {
			continue
		}
		out = append(out, field)
	}
	return out
}

// scoreChunk computes a term-overlap score between `content` and the
// query terms. Each unique query term that appears in `content`
// contributes one point; repeated occurrences contribute a small
// fractional bonus so chunks that mention a term multiple times
// outrank single-mention chunks at the same coverage level.
func scoreChunk(content string, terms []string) float64 {
	chunkTokens := tokenize(content)
	if len(chunkTokens) == 0 {
		return 0
	}
	chunkCounts := map[string]int{}
	for _, t := range chunkTokens {
		chunkCounts[t]++
	}
	score := 0.0
	for _, q := range uniq(terms) {
		count, ok := chunkCounts[q]
		if !ok {
			continue
		}
		score += 1.0 + 0.1*float64(count-1)
	}
	return score
}

func uniq(ss []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, s := range ss {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

// stopwords filters out a small set of common English glue words so
// queries like "what about the vendor" don't match every chunk that
// happens to contain "the". The list is intentionally tiny — the
// demo's content is short enough that aggressive filtering would
// hurt recall.
var stopwords = map[string]struct{}{
	"the": {}, "and": {}, "for": {}, "with": {}, "that": {},
	"this": {}, "are": {}, "was": {}, "were": {}, "but": {},
	"has": {}, "have": {}, "had": {}, "you": {}, "your": {},
	"will": {}, "would": {}, "should": {}, "could": {},
	"from": {}, "into": {}, "onto": {}, "about": {}, "what": {},
}

func isStopword(s string) bool {
	_, ok := stopwords[s]
	return ok
}
