package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func newTestServer() http.Handler {
	mem := store.NewMemory()
	store.Seed(mem)
	return api.NewRouter(api.Deps{
		Identity:   services.NewIdentity(mem, "user_alice"),
		Workspaces: services.NewWorkspace(mem),
		Chat:       services.NewChat(mem),
		KApps:      services.NewKApps(mem),
		Inference:  inference.NewMockAdapter(),
	})
}

func doGet(t *testing.T, h http.Handler, target string, userID string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", target, nil)
	if userID != "" {
		req.Header.Set("X-User-ID", userID)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestListChatsB2CFiltersByContext(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats?context=b2c", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Chats []models.Channel `json:"chats"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Chats) == 0 {
		t.Fatalf("expected at least one b2c chat for alice")
	}
	for _, c := range body.Chats {
		if c.Context != models.ContextB2C {
			t.Errorf("expected only b2c chats, got %s with context %s", c.ID, c.Context)
		}
	}
}

func TestListChatsB2BFiltersByContext(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats?context=b2b", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Chats []models.Channel `json:"chats"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	for _, c := range body.Chats {
		if c.Context != models.ContextB2B {
			t.Errorf("expected only b2b chats, got %s", c.ID)
		}
	}
}

func TestListChatsRejectsInvalidContext(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats?context=enterprise", "user_alice")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid context, got %d", rec.Code)
	}
}

func TestChatMessagesReturnsSeededFamilyMessages(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats/ch_family/messages", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Messages []models.Message `json:"messages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Messages) == 0 {
		t.Fatalf("expected family messages")
	}
	// Sanity: the field-trip sentinel string is part of the seeded data.
	found := false
	for _, m := range body.Messages {
		if contains(m.Content, "Field trip form") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected to find 'Field trip form' message in seed")
	}
}

func TestThreadMessagesIncludesRootAndReplies(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/threads/msg_vend_root/messages", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Messages []models.Message `json:"messages"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Messages) < 2 {
		t.Fatalf("expected at least root + reply, got %d", len(body.Messages))
	}
	if body.Messages[0].ID != "msg_vend_root" {
		t.Errorf("expected first message to be the thread root, got %s", body.Messages[0].ID)
	}
}

func TestUsersListReturnsFullDirectory(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/users", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Users []models.User `json:"users"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Users) != 5 {
		t.Fatalf("expected 5 seeded users, got %d", len(body.Users))
	}
	wantIDs := map[string]bool{
		"user_alice": false, "user_bob": false, "user_carol": false,
		"user_dave": false, "user_eve": false,
	}
	for _, u := range body.Users {
		if _, ok := wantIDs[u.ID]; ok {
			wantIDs[u.ID] = true
		}
	}
	for id, seen := range wantIDs {
		if !seen {
			t.Errorf("expected user %s in directory", id)
		}
	}
}

func TestUsersMeReturnsAuthenticatedUser(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/users/me", "user_dave")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var u models.User
	_ = json.Unmarshal(rec.Body.Bytes(), &u)
	if u.ID != "user_dave" {
		t.Errorf("expected user_dave, got %s", u.ID)
	}
}

func TestWorkspacesAndChannels(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	rec = doGet(t, h, "/api/workspaces/ws_acme/channels?context=b2b", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Channels []models.Channel `json:"channels"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Channels) != 3 {
		t.Errorf("expected 3 acme channels, got %d", len(body.Channels))
	}

	rec = doGet(t, h, "/api/workspaces/ws_missing/channels", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for missing workspace, got %d", rec.Code)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
