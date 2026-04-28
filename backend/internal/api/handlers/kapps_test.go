package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

func TestKAppsCardsReturnsAllSeededKinds(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Cards) < 4 {
		t.Fatalf("expected at least 4 seeded cards, got %d", len(body.Cards))
	}
	kinds := map[models.CardKind]bool{}
	for _, c := range body.Cards {
		kinds[c.Kind] = true
	}
	want := []models.CardKind{
		models.CardKindTask,
		models.CardKindApproval,
		models.CardKindArtifact,
		models.CardKindEvent,
	}
	for _, k := range want {
		if !kinds[k] {
			t.Errorf("expected at least one card of kind %q", k)
		}
	}
}

func TestKAppsCardsTaskHasExpectedFields(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards", "user_alice")
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)

	var task *models.Task
	for _, c := range body.Cards {
		if c.Kind == models.CardKindTask {
			task = c.Task
			break
		}
	}
	if task == nil {
		t.Fatalf("expected at least one task card")
	}
	if task.Title == "" || task.ChannelID == "" {
		t.Errorf("expected task to have title and channel, got %+v", task)
	}
	if !task.AIGenerated {
		t.Errorf("expected seeded task to be AI-generated")
	}
	if task.SourceMessageID == "" {
		t.Errorf("expected task to back-link to a source message")
	}
}

func TestKAppsCardsApprovalHasFieldsAndDecisionLog(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards", "user_alice")
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)

	var appr *models.Approval
	for _, c := range body.Cards {
		if c.Kind == models.CardKindApproval {
			appr = c.Approval
			break
		}
	}
	if appr == nil {
		t.Fatalf("expected at least one approval card")
	}
	if appr.Status != models.ApprovalStatusPending {
		t.Errorf("expected pending approval, got %q", appr.Status)
	}
	if appr.Fields.Vendor == "" || appr.Fields.Amount == "" {
		t.Errorf("expected approval fields to be populated, got %+v", appr.Fields)
	}
	if appr.DecisionLog == nil {
		t.Errorf("expected decision log slice to exist (even if empty)")
	}
}

func TestKAppsExtractTasksFromThreadReturnsTasksWithProvenance(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/kapps/tasks/extract", map[string]any{
		"threadId": "msg_eng_root",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Tasks []struct {
			Title           string `json:"title"`
			Owner           string `json:"owner,omitempty"`
			DueDate         string `json:"dueDate,omitempty"`
			Status          string `json:"status"`
			SourceMessageID string `json:"sourceMessageId,omitempty"`
		} `json:"tasks"`
		ThreadID        string `json:"threadId"`
		ChannelID       string `json:"channelId"`
		Model           string `json:"model"`
		ComputeLocation string `json:"computeLocation"`
		DataEgressBytes int    `json:"dataEgressBytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Tasks) == 0 {
		t.Fatalf("expected at least one extracted task, got 0")
	}
	for _, task := range body.Tasks {
		if task.Title == "" {
			t.Errorf("expected non-empty task title in %+v", task)
		}
		if task.Status == "" {
			t.Errorf("expected non-empty status in %+v", task)
		}
		if task.SourceMessageID == "" {
			t.Errorf("expected source-message provenance in %+v", task)
		}
	}
	if body.ThreadID != "msg_eng_root" {
		t.Errorf("expected threadId echo, got %q", body.ThreadID)
	}
	if body.ChannelID == "" {
		t.Errorf("expected channelId in response")
	}
	if body.ComputeLocation != "on_device" {
		t.Errorf("expected on_device, got %q", body.ComputeLocation)
	}
	if body.DataEgressBytes != 0 {
		t.Errorf("expected zero egress, got %d", body.DataEgressBytes)
	}
}

func TestKAppsExtractTasksRequiresThreadID(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/kapps/tasks/extract", map[string]any{})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestKAppsExtractTasks404OnUnknownThread(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/kapps/tasks/extract", map[string]any{
		"threadId": "thread_does_not_exist",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestKAppsCardsFiltersByChannel(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards?channelId=ch_family", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Cards) == 0 {
		t.Fatalf("expected at least one card for ch_family")
	}
	for _, c := range body.Cards {
		channelID := ""
		switch c.Kind {
		case models.CardKindTask:
			channelID = c.Task.ChannelID
		case models.CardKindApproval:
			channelID = c.Approval.ChannelID
		case models.CardKindArtifact:
			channelID = c.Artifact.ChannelID
		case models.CardKindEvent:
			channelID = c.Event.ChannelID
		}
		if channelID != "ch_family" {
			t.Errorf("expected only ch_family cards, got %s", channelID)
		}
	}
}
