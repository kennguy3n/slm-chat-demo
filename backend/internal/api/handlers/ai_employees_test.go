package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

func TestListAIEmployeesReturnsSeeded(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/ai-employees", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		AIEmployees []models.AIEmployee `json:"aiEmployees"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.AIEmployees) != 3 {
		t.Fatalf("expected 3 seeded AI employees, got %d", len(body.AIEmployees))
	}
	ids := map[string]bool{}
	for _, e := range body.AIEmployees {
		ids[e.ID] = true
	}
	for _, want := range []string{models.KaraOpsAI, models.NinaPMAI, models.MikaSalesAI} {
		if !ids[want] {
			t.Errorf("expected seeded employee %q in list", want)
		}
	}
}

func TestGetAIEmployeeReturnsProfile(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/ai-employees/"+models.KaraOpsAI, "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.AIEmployee.ID != models.KaraOpsAI {
		t.Errorf("expected Kara Ops AI, got %q", body.AIEmployee.ID)
	}
	if body.AIEmployee.Role != models.AIEmployeeRoleOps {
		t.Errorf("expected role=ops, got %q", body.AIEmployee.Role)
	}
	if len(body.AIEmployee.AllowedChannelIDs) == 0 {
		t.Errorf("expected seeded allowedChannelIds, got empty")
	}
	if len(body.AIEmployee.Recipes) == 0 {
		t.Errorf("expected seeded recipes, got empty")
	}
}

func TestGetAIEmployee404ForUnknownID(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/ai-employees/ai_unknown", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPatchAIEmployeeChannelsPersists(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelIds":["ch_general","ch_engineering"]}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/channels", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.AIEmployee.AllowedChannelIDs) != 2 {
		t.Fatalf("expected 2 channels, got %v", resp.AIEmployee.AllowedChannelIDs)
	}

	// Verify the change persisted across the GET boundary.
	rec = doGet(t, h, "/api/ai-employees/"+models.KaraOpsAI, "user_alice")
	var after struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &after)
	got := after.AIEmployee.AllowedChannelIDs
	if len(got) != 2 || got[0] != "ch_general" || got[1] != "ch_engineering" {
		t.Errorf("expected persisted [ch_general ch_engineering], got %v", got)
	}
}

func TestPatchAIEmployeeChannelsRejectsUnknownChannel(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelIds":["ch_does_not_exist"]}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/channels", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown channel, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPatchAIEmployeeChannels404ForUnknownEmployee(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelIds":["ch_general"]}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/ai_unknown/channels", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPatchAIEmployeeRecipesReplacesList(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"recipeIds":["summarize","draft_prd"]}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/"+models.NinaPMAI+"/recipes", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.AIEmployee.Recipes) != 2 {
		t.Errorf("expected 2 recipes after update, got %v", resp.AIEmployee.Recipes)
	}
}
