package services_test

import (
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func newSeeded(t *testing.T) *store.Memory {
	t.Helper()
	m := store.NewMemory()
	store.Seed(m)
	return m
}

func TestChatsForUserMergesContextsWhenEmpty(t *testing.T) {
	m := newSeeded(t)
	svc := services.NewChat(m)

	all := svc.ChatsForUser("user_alice", "")
	if len(all) == 0 {
		t.Fatalf("expected alice to have chats across both contexts")
	}
	hasB2C, hasB2B := false, false
	for _, c := range all {
		if c.Context == models.ContextB2C {
			hasB2C = true
		}
		if c.Context == models.ContextB2B {
			hasB2B = true
		}
	}
	if !hasB2C || !hasB2B {
		t.Errorf("expected alice to have both b2c and b2b chats; got b2c=%v b2b=%v", hasB2C, hasB2B)
	}
}

func TestChannelMessagesEmptyForUnknownChannel(t *testing.T) {
	m := newSeeded(t)
	svc := services.NewChat(m)
	if got := svc.ChannelMessages("nope"); len(got) != 0 {
		t.Errorf("expected empty result for unknown channel, got %d messages", len(got))
	}
}

func TestThreadMessagesIncludesRoot(t *testing.T) {
	m := newSeeded(t)
	svc := services.NewChat(m)
	msgs := svc.ThreadMessages("msg_eng_root")
	if len(msgs) == 0 {
		t.Fatalf("expected engineering thread to have messages")
	}
	if msgs[0].ID != "msg_eng_root" {
		t.Errorf("expected first thread message to be root, got %s", msgs[0].ID)
	}
}
