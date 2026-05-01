package handlers_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func newTestServer() http.Handler {
	mem := store.NewMemory()
	store.Seed(mem)
	audit := services.NewAudit(mem)
	return api.NewRouter(api.Deps{
		Identity:      services.NewIdentity(mem, "user_alice"),
		Workspaces:    services.NewWorkspace(mem),
		Chat:          services.NewChat(mem),
		KApps:         services.NewKApps(mem).WithAudit(audit),
		Audit:         audit,
		AIEmployees:   services.NewAIEmployeeService(mem),
		RecipeRuns:    services.NewRecipeRunService(mem),
		Connectors:    services.NewConnectorService(mem),
		Retrieval:     services.NewRetrievalService(mem),
		Knowledge:     services.NewKnowledgeService(mem),
		Policy:        services.NewPolicyService(mem),
		Encryption:    services.NewEncryptionKeyService(mem),
		TenantStorage: services.NewTenantStorageService(mem),
		Store:         mem,
	})
}

func doGet(t *testing.T, h http.Handler, target string, userID string) *httptest.ResponseRecorder {
	t.Helper()
	return doRequest(t, h, "GET", target, userID, nil)
}

func doRequest(
	t *testing.T,
	h http.Handler,
	method, target, userID string,
	body io.Reader,
) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
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

// TestChatMessagesReturnsSeededBilingualMessages exercises the
// redesigned headline B2C channel (Alice ↔ Minh, EN ↔ VI). The
// 2026-05-01 ground-zero LLM redesign collapsed B2C to this single
// channel so every demo flow (translation, summary, smart reply,
// task extraction, conversation insights) hits the on-device LLM
// against a real bilingual conversation rather than seeded mocks.
func TestChatMessagesReturnsSeededBilingualMessages(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats/ch_dm_alice_minh/messages", "user_alice")
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
		t.Fatalf("expected bilingual DM messages")
	}
	// Sanity: at least one Vietnamese sentinel string appears in the
	// seeded conversation.
	found := false
	for _, m := range body.Messages {
		if contains(m.Content, "phở") || contains(m.Content, "chè") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected to find a Vietnamese sentinel ('phở' or 'chè') in seeded DM")
	}
}

func TestChannelMessagesIncludeRepliesFlattensThreadContent(t *testing.T) {
	h := newTestServer()
	// Without the flag the vendor channel returns only top-level
	// messages — none of the in-thread reply IDs (msg_vend_r1…).
	rec := doGet(t, h, "/api/chats/ch_vendor_management/messages", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var top struct {
		Messages []models.Message `json:"messages"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &top)
	for _, m := range top.Messages {
		if m.ID == "msg_vend_r1" {
			t.Fatalf("expected reply IDs to be excluded from top-level listing")
		}
	}
	// With the flag set, replies (msg_vend_r1, …) are included.
	rec = doGet(t, h, "/api/chats/ch_vendor_management/messages?includeReplies=true", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var all struct {
		Messages []models.Message `json:"messages"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &all)
	if len(all.Messages) <= len(top.Messages) {
		t.Fatalf("expected includeReplies=true to surface more messages, got %d ≤ %d", len(all.Messages), len(top.Messages))
	}
	foundReply := false
	for _, m := range all.Messages {
		if m.ID == "msg_vend_r1" {
			foundReply = true
			break
		}
	}
	if !foundReply {
		t.Errorf("expected msg_vend_r1 (a thread reply) to appear in includeReplies=true result")
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
	if len(body.Users) != 6 {
		t.Fatalf("expected 6 seeded users, got %d", len(body.Users))
	}
	wantIDs := map[string]bool{
		"user_alice": false, "user_bob": false, "user_carol": false,
		"user_dave": false, "user_eve": false, "user_minh": false,
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
	// 4 = general, engineering, vendor-management, product-launch
	// (the last added during the B2B real-LLM redesign so Bonsai-1.7B
	// has a multi-topic thread to summarise).
	if len(body.Channels) != 4 {
		t.Errorf("expected 4 acme channels, got %d", len(body.Channels))
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
