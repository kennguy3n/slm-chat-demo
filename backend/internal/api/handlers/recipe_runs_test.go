package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

func TestRecipeRunsQueueStartsEmpty(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/ai-employees/"+models.KaraOpsAI+"/queue", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		RecipeRuns []models.RecipeRun `json:"recipeRuns"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.RecipeRuns) != 0 {
		t.Fatalf("expected empty queue, got %d runs", len(body.RecipeRuns))
	}
}

func TestRecipeRunsQueue404ForUnknownEmployee(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/ai-employees/ai_unknown/queue", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestRecipeRunsRecordAppendsToQueue(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{
		"recipeId": "summarize",
		"channelId": "ch_engineering",
		"threadId": "thr_ops_root",
		"status": "pending"
	}`)
	rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/queue", "user_alice", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created struct {
		RecipeRun models.RecipeRun `json:"recipeRun"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	if created.RecipeRun.ID == "" {
		t.Errorf("expected service to assign an ID, got empty")
	}
	if created.RecipeRun.AIEmployeeID != models.KaraOpsAI {
		t.Errorf("expected aiEmployeeId=%q, got %q", models.KaraOpsAI, created.RecipeRun.AIEmployeeID)
	}
	if created.RecipeRun.RecipeID != "summarize" {
		t.Errorf("expected recipeId=summarize, got %q", created.RecipeRun.RecipeID)
	}
	if created.RecipeRun.Status != models.RecipeRunStatusPending {
		t.Errorf("expected status=pending, got %q", created.RecipeRun.Status)
	}
	if created.RecipeRun.CreatedAt.IsZero() {
		t.Errorf("expected service to stamp createdAt")
	}

	// Queue should now show the run on GET.
	rec = doGet(t, h, "/api/ai-employees/"+models.KaraOpsAI+"/queue", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var list struct {
		RecipeRuns []models.RecipeRun `json:"recipeRuns"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(list.RecipeRuns) != 1 {
		t.Fatalf("expected 1 run, got %d", len(list.RecipeRuns))
	}
	if list.RecipeRuns[0].ID != created.RecipeRun.ID {
		t.Errorf("expected id=%q, got %q", created.RecipeRun.ID, list.RecipeRuns[0].ID)
	}
}

func TestRecipeRunsRecordRejectsMissingRecipeID(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelId":"ch_engineering"}`)
	rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/queue", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRecipeRunsListFiltersByAIEmployee(t *testing.T) {
	h := newTestServer()
	// Record one run for Kara.
	b1 := bytes.NewBufferString(`{"recipeId":"summarize","channelId":"ch_engineering","status":"pending"}`)
	if rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.KaraOpsAI+"/queue", "user_alice", b1); rec.Code != http.StatusCreated {
		t.Fatalf("kara record: got %d: %s", rec.Code, rec.Body.String())
	}
	// Record one run for Nina.
	b2 := bytes.NewBufferString(`{"recipeId":"draft_prd","channelId":"ch_engineering","status":"pending"}`)
	if rec := doRequest(t, h, "POST", "/api/ai-employees/"+models.NinaPMAI+"/queue", "user_alice", b2); rec.Code != http.StatusCreated {
		t.Fatalf("nina record: got %d: %s", rec.Code, rec.Body.String())
	}

	// Kara's queue should contain only her run.
	rec := doGet(t, h, "/api/ai-employees/"+models.KaraOpsAI+"/queue", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("kara list: %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		RecipeRuns []models.RecipeRun `json:"recipeRuns"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.RecipeRuns) != 1 {
		t.Fatalf("expected 1 kara run, got %d", len(body.RecipeRuns))
	}
	if body.RecipeRuns[0].AIEmployeeID != models.KaraOpsAI {
		t.Errorf("expected aiEmployeeId=%q, got %q", models.KaraOpsAI, body.RecipeRuns[0].AIEmployeeID)
	}
	if body.RecipeRuns[0].RecipeID != "summarize" {
		t.Errorf("expected recipeId=summarize, got %q", body.RecipeRuns[0].RecipeID)
	}
}
