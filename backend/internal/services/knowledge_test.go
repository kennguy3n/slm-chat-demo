package services

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// TestTruncateKeepsUTF8CharactersIntact exercises the rune-aware
// truncate helper with multi-byte content (emoji + CJK). The byte-
// slice version sliced multi-byte runes in half and produced invalid
// UTF-8.
func TestTruncateKeepsUTF8CharactersIntact(t *testing.T) {
	cases := []struct {
		name string
		in   string
		max  int
	}{
		{"emoji", strings.Repeat("😀", 10), 5},
		{"cjk", strings.Repeat("漢", 10), 5},
		{"mixed", "hello 漢字 world 😀😀😀😀", 12},
		{"shorter than max", "短い", 50},
		{"exact rune count", "abcde", 5},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := truncate(tc.in, tc.max)
			if !utf8.ValidString(out) {
				t.Fatalf("truncate produced invalid UTF-8: %q", out)
			}
			runes := []rune(strings.TrimSuffix(strings.TrimSpace(out), "…"))
			if len(runes) > tc.max {
				t.Fatalf("expected ≤ %d runes, got %d (%q)", tc.max, len(runes), out)
			}
		})
	}
}

// TestExtractFromMessageMentionActionUsesLowerConfidence verifies the
// owner-entity switch's two cases stay distinct: a bare "@user please
// review" mention produces an owner entity at 0.6 confidence, not the
// 0.75 reserved for explicit "owner:" / "responsible:" / "assigned to"
// language. Before the fix the second case was unreachable because the
// first case's OR included the same mention regex.
func TestExtractFromMessageMentionActionUsesLowerConfidence(t *testing.T) {
	msg := models.Message{
		ID:        "msg_1",
		ChannelID: "ch_engineering",
		Content:   "@dave please review the PRD",
	}
	entities := extractFromMessage(msg)

	var owner *models.KnowledgeEntity
	for i := range entities {
		if entities[i].Kind == models.KnowledgeEntityKindOwner {
			owner = &entities[i]
			break
		}
	}
	if owner == nil {
		t.Fatalf("expected an owner entity for %q, got %d entities", msg.Content, len(entities))
	}
	if owner.Confidence != 0.6 {
		t.Fatalf("expected confidence 0.6 for @mention+action, got %v", owner.Confidence)
	}
	if len(owner.Actors) == 0 || owner.Actors[0] != "dave" {
		t.Fatalf("expected actor=dave, got %v", owner.Actors)
	}
}

// TestExtractFromMessageOwnerKeywordKeepsHigherConfidence is the
// counterpart sanity check — explicit "owner:" language must still
// yield the 0.75-confidence entity so the fix doesn't regress the
// stronger signal.
func TestExtractFromMessageOwnerKeywordKeepsHigherConfidence(t *testing.T) {
	msg := models.Message{
		ID:        "msg_2",
		ChannelID: "ch_engineering",
		Content:   "owner: @dave for the PRD draft",
	}
	entities := extractFromMessage(msg)
	var owner *models.KnowledgeEntity
	for i := range entities {
		if entities[i].Kind == models.KnowledgeEntityKindOwner {
			owner = &entities[i]
			break
		}
	}
	if owner == nil {
		t.Fatalf("expected an owner entity for explicit keyword")
	}
	if owner.Confidence != 0.75 {
		t.Fatalf("expected confidence 0.75 for owner: keyword, got %v", owner.Confidence)
	}
}

// TestKnowledgeServiceExtractEntitiesUTF8 wires the truncate fix into
// the service-level path: a message with multi-byte content stored
// through ExtractEntities must round-trip valid UTF-8 in its
// description even when the content exceeds the 240-rune cap.
func TestKnowledgeServiceExtractEntitiesUTF8(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	svc := NewKnowledgeService(mem)
	long := strings.Repeat("漢字", 200) + " decided to ship"
	mem.PutMessage(models.Message{
		ID:        "msg_utf8",
		ChannelID: "ch_engineering",
		Content:   long,
	})
	entities, err := svc.ExtractEntities("ch_engineering")
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	for _, e := range entities {
		if !utf8.ValidString(e.Description) {
			t.Fatalf("invalid UTF-8 in description: %q", e.Description)
		}
		if !utf8.ValidString(e.Title) {
			t.Fatalf("invalid UTF-8 in title: %q", e.Title)
		}
	}
}
