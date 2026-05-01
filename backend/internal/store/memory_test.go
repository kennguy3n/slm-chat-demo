package store_test

import (
	"testing"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func TestSeedPopulatesUsersAndWorkspaces(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	users := m.ListUsers()
	if len(users) != 6 {
		t.Fatalf("expected 6 seeded users, got %d", len(users))
	}

	wantUsers := []string{"user_alice", "user_bob", "user_carol", "user_dave", "user_eve", "user_minh"}
	for _, id := range wantUsers {
		if _, ok := m.GetUser(id); !ok {
			t.Errorf("expected user %q to be seeded", id)
		}
	}

	wss := m.ListWorkspaces()
	if len(wss) != 2 {
		t.Fatalf("expected 2 seeded workspaces, got %d", len(wss))
	}
	personal, ok := m.GetWorkspace("ws_personal")
	if !ok || personal.Context != models.ContextB2C {
		t.Errorf("expected ws_personal to have b2c context")
	}
	acme, ok := m.GetWorkspace("ws_acme")
	if !ok || acme.Context != models.ContextB2B {
		t.Errorf("expected ws_acme to have b2b context")
	}
	if len(acme.Domains) != 2 {
		t.Errorf("expected ws_acme to have 2 domains, got %d", len(acme.Domains))
	}
}

func TestListChannelsForUserFiltersByContext(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	b2c := m.ListChannelsForUser("user_alice", models.ContextB2C)
	if len(b2c) == 0 {
		t.Fatalf("expected alice to have b2c channels")
	}
	for _, c := range b2c {
		if c.Context != models.ContextB2C {
			t.Errorf("got non-b2c channel %s in b2c filter", c.ID)
		}
	}

	b2b := m.ListChannelsForUser("user_alice", models.ContextB2B)
	if len(b2b) == 0 {
		t.Fatalf("expected alice to have b2b channels")
	}
	for _, c := range b2b {
		if c.Context != models.ContextB2B {
			t.Errorf("got non-b2b channel %s in b2b filter", c.ID)
		}
	}

	// Carol is no longer a member of any seeded channel after the
	// 2026-05-01 B2C ground-zero LLM redesign collapsed the B2C
	// surface to a single bilingual VI↔EN DM. The empty result
	// here documents that fact — the user record is still seeded so
	// existing references in form templates and AI activity logs
	// continue to resolve.
	carol := m.ListChannelsForUser("user_carol", "")
	if len(carol) != 0 {
		t.Errorf("expected carol to have no seeded channels after B2C redesign, got %+v", carol)
	}
}

func TestChannelMessagesAndThreadMessages(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	// The bilingual VI↔EN DM is the headline B2C demo channel and
	// carries enough back-and-forth for the translation, summary,
	// smart-reply, and conversation-insights flows.
	dmMsgs := m.ListChannelMessages("ch_dm_alice_minh")
	if len(dmMsgs) < 5 {
		t.Fatalf("expected at least 5 top-level DM messages, got %d", len(dmMsgs))
	}
	// Sorted ascending by createdAt.
	for i := 1; i < len(dmMsgs); i++ {
		if dmMsgs[i].CreatedAt.Before(dmMsgs[i-1].CreatedAt) {
			t.Errorf("messages not sorted ascending: %v before %v", dmMsgs[i].CreatedAt, dmMsgs[i-1].CreatedAt)
		}
	}

	thread := m.ListThreadMessages("msg_vend_root")
	if len(thread) < 5 {
		t.Fatalf("expected at least 5 vendor thread messages, got %d", len(thread))
	}
	if thread[0].ID != "msg_vend_root" {
		t.Errorf("expected first thread message to be the root, got %s", thread[0].ID)
	}
}

func TestPutAndGetMessageRoundTrip(t *testing.T) {
	m := store.NewMemory()
	msg := models.Message{
		ID:        "test_msg",
		ChannelID: "ch_x",
		SenderID:  "user_alice",
		Content:   "hello",
		CreatedAt: time.Now(),
	}
	m.PutMessage(msg)
	got := m.ListChannelMessages("ch_x")
	if len(got) != 1 || got[0].ID != "test_msg" {
		t.Fatalf("expected to round-trip a single message, got %+v", got)
	}
}
