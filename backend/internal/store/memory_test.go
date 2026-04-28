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
	if len(users) != 5 {
		t.Fatalf("expected 5 seeded users, got %d", len(users))
	}

	wantUsers := []string{"user_alice", "user_bob", "user_carol", "user_dave", "user_eve"}
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

	// Carol should appear in the neighborhood community channel only.
	carol := m.ListChannelsForUser("user_carol", "")
	if len(carol) != 1 || carol[0].ID != "ch_neighborhood" {
		t.Errorf("expected carol to be a member of only ch_neighborhood, got %+v", carol)
	}
}

func TestChannelMessagesAndThreadMessages(t *testing.T) {
	m := store.NewMemory()
	store.Seed(m)

	famMsgs := m.ListChannelMessages("ch_family")
	if len(famMsgs) != 3 {
		t.Fatalf("expected 3 top-level family messages, got %d", len(famMsgs))
	}
	// Sorted ascending by createdAt.
	for i := 1; i < len(famMsgs); i++ {
		if famMsgs[i].CreatedAt.Before(famMsgs[i-1].CreatedAt) {
			t.Errorf("messages not sorted ascending: %v before %v", famMsgs[i].CreatedAt, famMsgs[i-1].CreatedAt)
		}
	}

	thread := m.ListThreadMessages("msg_vend_root")
	if len(thread) != 5 {
		t.Fatalf("expected 5 thread messages, got %d", len(thread))
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
