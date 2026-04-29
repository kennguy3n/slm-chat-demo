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

func TestPatchAIEmployeeBudgetSetsLimit(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"maxTokensPerDay":250000}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/budget", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.AIEmployee.Budget.MaxTokensPerDay != 250000 {
		t.Errorf("expected maxTokensPerDay=250000, got %d", resp.AIEmployee.Budget.MaxTokensPerDay)
	}
}

func TestPatchAIEmployeeBudgetRejectsNegative(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"maxTokensPerDay":-1}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/budget", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative maxTokensPerDay, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPatchAIEmployeeBudgetRequiresField(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/budget", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing field, got %d", rec.Code)
	}
}

func TestPatchAIEmployeeBudget404ForUnknownEmployee(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"maxTokensPerDay":1000}`)
	rec := doRequest(t, h, "PATCH", "/api/ai-employees/ai_unknown/budget", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPostAIEmployeeBudgetIncrementHappyPath(t *testing.T) {
	h := newTestServer()
	// Set a known ceiling first.
	doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/budget", "user_alice",
		bytes.NewBufferString(`{"maxTokensPerDay":100000}`))

	body := bytes.NewBufferString(`{"tokensUsed":5000}`)
	rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/budget/increment", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.AIEmployee.Budget.UsedTokensToday != 5000 {
		t.Errorf("expected usedTokensToday=5000, got %d", resp.AIEmployee.Budget.UsedTokensToday)
	}
}

func TestPostAIEmployeeBudgetIncrementReturns429WhenExceeded(t *testing.T) {
	h := newTestServer()
	doRequest(t, h, "PATCH", "/api/ai-employees/"+models.KaraOpsAI+"/budget", "user_alice",
		bytes.NewBufferString(`{"maxTokensPerDay":1000}`))

	// First burn most of the budget.
	doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/budget/increment", "user_alice",
		bytes.NewBufferString(`{"tokensUsed":900}`))

	// Next increment should overshoot and come back as 429.
	rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/budget/increment", "user_alice",
		bytes.NewBufferString(`{"tokensUsed":500}`))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 when budget exceeded, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		AIEmployee models.AIEmployee `json:"aiEmployee"`
		Error      string            `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Error == "" {
		t.Errorf("expected error message in 429 body")
	}
	// Counter must not have been incremented on the refused request.
	if resp.AIEmployee.Budget.UsedTokensToday != 900 {
		t.Errorf("expected usedTokensToday to stay at 900 after refusal, got %d",
			resp.AIEmployee.Budget.UsedTokensToday)
	}
}

func TestPostAIEmployeeBudgetIncrement404ForUnknownEmployee(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"tokensUsed":100}`)
	rec := doRequest(t, h, "POST", "/api/ai-employees/ai_unknown/budget/increment", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPostAIEmployeeBudgetIncrementRequiresField(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{}`)
	rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/budget/increment", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing field, got %d", rec.Code)
	}
}

func TestPostAIEmployeeBudgetIncrementRejectsNegative(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"tokensUsed":-1}`)
	rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/budget/increment", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative tokensUsed, got %d", rec.Code)
	}
}
