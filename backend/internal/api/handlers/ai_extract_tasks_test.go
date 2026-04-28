package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestExtractTasksFromMessageReturnsItems(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/extract-tasks", map[string]any{
		"messageId": "msg_fam_1",
		"channelId": "ch_family",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Tasks []struct {
			Title   string `json:"title"`
			DueDate string `json:"dueDate,omitempty"`
			Type    string `json:"type"`
		} `json:"tasks"`
		SourceMessageID string `json:"sourceMessageId"`
		ChannelID       string `json:"channelId"`
		Model           string `json:"model"`
		ComputeLocation string `json:"computeLocation"`
		DataEgressBytes int    `json:"dataEgressBytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Tasks) == 0 {
		t.Fatalf("expected at least one extracted task")
	}
	for _, task := range body.Tasks {
		if task.Title == "" {
			t.Errorf("expected non-empty task title in %+v", task)
		}
		switch task.Type {
		case "task", "reminder", "shopping":
			// ok
		default:
			t.Errorf("unexpected task type %q in %+v", task.Type, task)
		}
	}
	if body.SourceMessageID != "msg_fam_1" {
		t.Errorf("expected sourceMessageId=msg_fam_1, got %q", body.SourceMessageID)
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

func TestExtractTasksFallsBackToLatestChannelMessage(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/extract-tasks", map[string]any{
		"channelId": "ch_family",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		SourceMessageID string `json:"sourceMessageId"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.SourceMessageID == "" {
		t.Errorf("expected sourceMessageId to be set when only channelId is provided")
	}
}

func TestExtractTasksRequiresChannelOrMessage(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/extract-tasks", map[string]any{})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestExtractTasks404OnUnknownMessage(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/extract-tasks", map[string]any{
		"messageId": "msg_does_not_exist",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}
