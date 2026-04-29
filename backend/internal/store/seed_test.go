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
		if total < 5 {
			t.Errorf("channel %q: expected at least 5 total messages (top + threaded), got %d", id, total)
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

