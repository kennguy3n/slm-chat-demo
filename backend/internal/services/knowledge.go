package services

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// KnowledgeService is the Phase 5 workspace knowledge graph. It scans
// every message in a channel and extracts five kinds of structured
// entities — decisions, owners, risks, requirements, and deadlines —
// using simple keyword / pattern heuristics. The result is exposed to
// AI Employees as additional grounding context and to humans as the
// right-rail KnowledgeGraphPanel sections.
//
// Phase 5 deliberately ships a heuristic extractor rather than a real
// LLM-based one — the demo's seeded threads are short enough that
// keyword matching gives high-recall extraction, and the heuristic
// runs synchronously inside the data API without depending on the
// Electron inference router. A future phase can swap the
// `Extract*` helpers for an SLM-backed extractor without changing
// the entity schema, the API, or the renderer integration.
type KnowledgeService struct {
	store *store.Memory
}

// NewKnowledgeService constructs the service.
func NewKnowledgeService(s *store.Memory) *KnowledgeService {
	return &KnowledgeService{store: s}
}

// ExtractEntities (re-)runs the heuristic extractor against every
// message in `channelID` and returns the resulting entity set.
// Existing entities for the channel are dropped first so the graph
// reflects the current message corpus rather than accumulating stale
// matches across runs.
//
// Returns ErrNotFound if the channel does not exist.
func (s *KnowledgeService) ExtractEntities(channelID string) ([]models.KnowledgeEntity, error) {
	if _, ok := s.store.GetChannel(channelID); !ok {
		return nil, ErrNotFound
	}
	s.store.ClearKnowledgeEntitiesForChannel(channelID)

	messages := s.store.ListAllChannelMessages(channelID)
	out := []models.KnowledgeEntity{}
	for _, msg := range messages {
		for _, e := range extractFromMessage(msg) {
			s.store.AppendKnowledgeEntity(e)
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// List returns the entities currently stored for `channelID`,
// optionally filtered by kind. Returns ErrNotFound if the channel
// does not exist so handlers can surface a 404 distinct from "no
// entities yet".
func (s *KnowledgeService) List(channelID, kind string) ([]models.KnowledgeEntity, error) {
	if _, ok := s.store.GetChannel(channelID); !ok {
		return nil, ErrNotFound
	}
	return s.store.ListKnowledgeEntities(channelID, kind), nil
}

// Get returns a single entity by ID or ErrNotFound.
func (s *KnowledgeService) Get(id string) (models.KnowledgeEntity, error) {
	e, ok := s.store.GetKnowledgeEntity(id)
	if !ok {
		return models.KnowledgeEntity{}, ErrNotFound
	}
	return e, nil
}

// ---- Heuristic extractors ----

// decisionPatterns / ownerPatterns / etc. are evaluated against the
// lower-cased message body. Phrase patterns (e.g. "we will") are
// matched as plain substrings; ownership / deadline shapes that need
// surrounding context use the regexes below.
var (
	decisionPatterns = []string{
		"decided", "agreed", "approved", "we will", "going with",
		"pending decision", "decision",
	}
	riskPatterns = []string{
		"risk", "concern", "blocker", "issue", "problem",
	}
	requirementPatterns = []string{
		"must", "need to", "requirement", "should", "spec", "requirements",
	}
	deadlinePatterns = []string{
		"deadline", "due", "by eod", "by end of day",
		"by friday", "by monday", "by tuesday", "by wednesday",
		"by thursday", "by saturday", "by sunday",
	}
	ownerPatterns = []string{
		"assigned to", "owner:", "responsible:",
	}

	// dayOfWeekRe catches "Friday", "Saturday May 16", etc. so a
	// deadline message like "Block party Saturday May 16" gets
	// flagged even though it doesn't say "due" or "deadline".
	dayOfWeekRe = regexp.MustCompile(`(?i)\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`)
	// monthDayRe catches "May 16", "April 29", etc.
	monthDayRe = regexp.MustCompile(`(?i)\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b`)
	// isoDateRe catches "2026-05-16" style dates.
	isoDateRe = regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}\b`)
	// quarterRe catches "Q1" / "Q4 2026" — fiscal-quarter shorthand
	// is the most common deadline language in the seeded
	// vendor-management thread.
	quarterRe = regexp.MustCompile(`\bQ[1-4]\b`)

	// mentionActionRe catches "@dave please ..." style assignments —
	// an `@` mention followed by an action verb like please / can
	// you / take / handle / own / ship / draft / write.
	mentionActionRe = regexp.MustCompile(`(?i)@(\w+)[^\w]+(please|can you|take|handle|own|ship|draft|write|review|sign|grab|buy|pull|prepare|put together)`)
	// mentionRe catches a bare "@dave" mention.
	mentionRe = regexp.MustCompile(`@(\w+)`)
	// ownerColonRe catches "owner: dave" / "responsible: alice".
	ownerColonRe = regexp.MustCompile(`(?i)\b(owner|responsible|assigned to)[:\s]+@?(\w+)`)
)

func extractFromMessage(msg models.Message) []models.KnowledgeEntity {
	body := strings.TrimSpace(msg.Content)
	if body == "" {
		return nil
	}
	lower := strings.ToLower(body)
	out := []models.KnowledgeEntity{}

	if matched, hit := matchAny(lower, decisionPatterns); matched {
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindDecision, hit, body, nil, 0.7))
	}
	if matched, hit := matchAny(lower, riskPatterns); matched {
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindRisk, hit, body, nil, 0.7))
	}
	if matched, hit := matchAny(lower, requirementPatterns); matched {
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindRequirement, hit, body, nil, 0.65))
	}

	// Owner heuristics: explicit "owner:" / "responsible:" /
	// "assigned to" first, then `@mention + action verb` shapes.
	actors := extractActors(body)
	switch {
	case len(actors) > 0 && (containsAny(lower, ownerPatterns) || mentionActionRe.MatchString(body)):
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindOwner, "owner", body, actors, 0.75))
	case len(actors) > 0 && hasActionMention(body):
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindOwner, "owner", body, actors, 0.6))
	}

	// Deadlines: explicit "due / deadline / by EOD / by Friday"
	// phrases first, then bare date patterns.
	if matched, hit := matchAny(lower, deadlinePatterns); matched {
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindDeadline, hit, body, nil, 0.7))
	} else if dayOfWeekRe.MatchString(body) || monthDayRe.MatchString(body) ||
		isoDateRe.MatchString(body) || quarterRe.MatchString(body) {
		out = append(out, makeEntity(msg, models.KnowledgeEntityKindDeadline, "date", body, nil, 0.55))
	}

	return out
}

func makeEntity(
	msg models.Message,
	kind models.KnowledgeEntityKind,
	hit string,
	description string,
	actors []string,
	confidence float64,
) models.KnowledgeEntity {
	threadID := msg.ThreadID
	if threadID == "" {
		threadID = msg.ID
	}
	id := fmt.Sprintf("kg_%s_%s", kind, msg.ID)
	title := titleFor(kind, hit, description)
	return models.KnowledgeEntity{
		ID:              id,
		ChannelID:       msg.ChannelID,
		ThreadID:        threadID,
		SourceMessageID: msg.ID,
		Kind:            kind,
		Title:           title,
		Description:     truncate(description, 240),
		Actors:          actors,
		Status:          models.KnowledgeEntityStatusOpen,
		CreatedAt:       msg.CreatedAt,
		Confidence:      confidence,
	}
}

func titleFor(kind models.KnowledgeEntityKind, hit, description string) string {
	switch kind {
	case models.KnowledgeEntityKindDecision:
		return "Decision: " + truncate(description, 60)
	case models.KnowledgeEntityKindOwner:
		return "Owner: " + truncate(description, 60)
	case models.KnowledgeEntityKindRisk:
		return "Risk: " + truncate(description, 60)
	case models.KnowledgeEntityKindRequirement:
		return "Requirement: " + truncate(description, 60)
	case models.KnowledgeEntityKindDeadline:
		return "Deadline: " + truncate(description, 60)
	}
	_ = hit
	return truncate(description, 60)
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return strings.TrimSpace(s[:max]) + "…"
}

func matchAny(lower string, patterns []string) (bool, string) {
	for _, p := range patterns {
		if strings.Contains(lower, p) {
			return true, p
		}
	}
	return false, ""
}

func containsAny(s string, patterns []string) bool {
	matched, _ := matchAny(s, patterns)
	return matched
}

func extractActors(body string) []string {
	out := []string{}
	seen := map[string]struct{}{}
	if m := ownerColonRe.FindStringSubmatch(body); len(m) >= 3 {
		actor := strings.ToLower(m[2])
		seen[actor] = struct{}{}
		out = append(out, actor)
	}
	for _, m := range mentionRe.FindAllStringSubmatch(body, -1) {
		if len(m) < 2 {
			continue
		}
		actor := strings.ToLower(m[1])
		if _, ok := seen[actor]; ok {
			continue
		}
		seen[actor] = struct{}{}
		out = append(out, actor)
	}
	return out
}

func hasActionMention(body string) bool {
	return mentionActionRe.MatchString(body)
}
