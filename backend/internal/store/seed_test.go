package store_test

import (
	"strings"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// contents extracts Content strings from a list of messages. Small
// helper so the seed assertions below stay compact.
func contents(msgs []models.Message) []string {
	out := make([]string, len(msgs))
	for i, m := range msgs {
		out[i] = m.Content
	}
	return out
}

// TestSeededChannelsHaveEnoughMessages enforces a minimum of 5 messages
// per seeded channel (counting top-level messages + thread replies) so
// the demo surfaces are never empty after Phase 0 enrichment. This is
// the post-enrichment floor from the "Enrich seed/mock data for demo
// scenarios" task.
func TestSeededChannelsHaveEnoughMessages(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	channels := []string{
		"ch_dm_alice_bob",
		"ch_dm_alice_minh",
		"ch_family",
		"ch_neighborhood",
		"ch_general",
		"ch_engineering",
		"ch_vendor_management",
	}
	for _, id := range channels {
		top := m.ListChannelMessages(id)
		total := len(top)
		for _, msg := range top {
			if msg.ThreadID == msg.ID {
				// Subtract the root (ListThreadMessages will re-count it).
				total += len(m.ListThreadMessages(msg.ID)) - 1
			}
		}
		// The bilingual VI↔EN DM is now the headline B2C demo and
		// carries a 16-message conversation arc. Every other seeded
		// channel still carries the 5-message minimum the
		// PROPOSAL.md §5 demo flows depend on.
		minMessages := 5
		if id == "ch_dm_alice_minh" {
			minMessages = 15
		}
		if total < minMessages {
			t.Errorf("channel %q: expected at least %d total messages (top + threaded), got %d", id, minMessages, total)
		}
	}
}

// TestB2CChannelsCoverDemoFlows verifies the four B2C PROPOSAL.md §5
// demonstration flows still have the anchor messages they depend on
// after enrichment:
//
//   - §5.1 Morning Catch-up — family + neighborhood + DM have enough
//     cross-channel activity for the digest to summarise.
//   - §5.2 Task extraction — family `msg_fam_1` still carries the
//     field-trip form + sunscreen message.
//   - §5.2 RSVP event card — neighborhood `msg_comm_1` carries the
//     block-party invitation; additional events (garage sale, lost pet,
//     volunteer request) demonstrate multi-event extraction.
//   - §5.2 Smart reply — DM has enough back-and-forth to seed
//     reply-style suggestions; one line is Spanish for the translation
//     demo.
func TestB2CChannelsCoverDemoFlows(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	// 5.2 task-extraction anchor.
	msg, ok := m.GetMessage("msg_fam_1")
	if !ok {
		t.Fatal("expected msg_fam_1 (task-extraction anchor) to be seeded")
	}
	if !strings.Contains(msg.Content, "Field trip") || !strings.Contains(msg.Content, "sunscreen") {
		t.Errorf("msg_fam_1 no longer mentions field trip + sunscreen: %q", msg.Content)
	}

	// 5.2 RSVP event-card anchor.
	if _, ok := m.GetMessage("msg_comm_1"); !ok {
		t.Fatal("expected msg_comm_1 (block-party RSVP anchor) to be seeded")
	}

	// Additional neighborhood events referenced in the enriched seed.
	neigh := m.ListChannelMessages("ch_neighborhood")
	joined := strings.Join(contents(neigh), "\n")
	for _, keyword := range []string{"garage sale", "lost pet", "volunteer"} {
		if !strings.Contains(strings.ToLower(joined), keyword) {
			t.Errorf("ch_neighborhood missing enrichment keyword %q", keyword)
		}
	}

	// 5.1 Morning Catch-up needs multi-day family activity.
	fam := m.ListChannelMessages("ch_family")
	if len(fam) < 8 {
		t.Fatalf("expected at least 8 top-level family messages for morning-catchup digest, got %d", len(fam))
	}
	famJoined := strings.Join(contents(fam), "\n")
	for _, keyword := range []string{"piano recital", "parent-teacher", "birthday"} {
		if !strings.Contains(strings.ToLower(famJoined), strings.ToLower(keyword)) {
			t.Errorf("ch_family missing enrichment keyword %q", keyword)
		}
	}

	// Inline-translation demo requires at least one non-English line.
	dm := m.ListChannelMessages("ch_dm_alice_bob")
	if len(dm) < 6 {
		t.Fatalf("expected at least 6 DM messages, got %d", len(dm))
	}
	dmJoined := strings.Join(contents(dm), "\n")
	if !strings.Contains(dmJoined, "restaurante") && !strings.Contains(dmJoined, "siempre") {
		t.Errorf("ch_dm_alice_bob missing the Spanish line used by the translation demo")
	}

	// English ↔ Vietnamese translation demo has its own channel and
	// is now the headline B2C demo. Needs enough back-and-forth to
	// demonstrate the SLM handling both directions across many turns,
	// alternating senders so every bubble exercises a translation in
	// the partner's language.
	vi := m.ListChannelMessages("ch_dm_alice_minh")
	if len(vi) < 15 {
		t.Fatalf("expected at least 15 messages in ch_dm_alice_minh, got %d", len(vi))
	}
	viJoined := strings.Join(contents(vi), "\n")
	// At least one distinctively Vietnamese phrase (diacritics) and at
	// least one distinctively English phrase so the Translate affordance
	// has meaningful work on both sides.
	if !strings.Contains(viJoined, "phở") && !strings.Contains(viJoined, "Việt Nam") {
		t.Errorf("ch_dm_alice_minh missing a Vietnamese line with diacritics")
	}
	if !strings.Contains(viJoined, "Saturday") && !strings.Contains(viJoined, "umbrella") {
		t.Errorf("ch_dm_alice_minh missing a distinctively English line")
	}

	// Senders must alternate so the translate batch always has
	// material going in both directions; we check for a minimum
	// number of each sender rather than strict alternation, which is
	// a tighter regression test against accidentally seeding a single
	// participant.
	var fromAlice, fromMinh int
	for _, msg := range vi {
		switch msg.SenderID {
		case "user_alice":
			fromAlice++
		case "user_minh":
			fromMinh++
		}
	}
	if fromAlice < 5 || fromMinh < 5 {
		t.Errorf("ch_dm_alice_minh expected balanced participants (got alice=%d, minh=%d)", fromAlice, fromMinh)
	}

	// PartnerLanguage on the channel itself is what flips the
	// MessageList batch translation into bilingual mode.
	ch, ok := m.GetChannel("ch_dm_alice_minh")
	if !ok {
		t.Fatal("expected ch_dm_alice_minh channel to be seeded")
	}
	if ch.PartnerLanguage != "vi" {
		t.Errorf("expected ch_dm_alice_minh.PartnerLanguage = \"vi\", got %q", ch.PartnerLanguage)
	}
}

// TestB2BThreadsHaveEnoughMessagesForAI verifies that the two primary
// B2B AI demo flows still have enough source material:
//
//   - approval prefill (PROPOSAL 5.3) reads from the vendor-management
//     thread and now expects pricing / risk / decision messages.
//   - PRD draft (PROPOSAL 5.4) reads from the engineering channel and
//     now has a second thread (on-call rotation) plus the original
//     inline-translation thread.
func TestB2BThreadsHaveEnoughMessagesForAI(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	vend := m.ListThreadMessages("msg_vend_root")
	if len(vend) < 8 {
		t.Fatalf("expected at least 8 messages in the vendor-management thread, got %d", len(vend))
	}
	joined := strings.Join(contents(vend), "\n")
	for _, keyword := range []string{"Acme Logs", "SOC 2", "termination", "Decision"} {
		if !strings.Contains(joined, keyword) {
			t.Errorf("msg_vend_root thread missing required approval-prefill keyword %q", keyword)
		}
	}

	onc := m.ListThreadMessages("msg_eng_onc_root")
	if len(onc) < 4 {
		t.Fatalf("expected at least 4 messages in the on-call rotation thread, got %d", len(onc))
	}
	oncJoined := strings.Join(contents(onc), "\n")
	for _, keyword := range []string{"on-call", "rotation", "action items"} {
		if !strings.Contains(strings.ToLower(oncJoined), keyword) {
			t.Errorf("msg_eng_onc_root thread missing keyword %q", keyword)
		}
	}

	// #general now carries a Q2 OKR thread with explicit owners — a
	// source for the extract_tasks / summarize demos.
	okr := m.ListThreadMessages("msg_gen_okr_root")
	if len(okr) < 4 {
		t.Fatalf("expected at least 4 messages in the Q2 OKR thread, got %d", len(okr))
	}
}

