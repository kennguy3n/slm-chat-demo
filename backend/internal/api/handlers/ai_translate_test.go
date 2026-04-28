package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestTranslateReturnsOriginalAndTranslated(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/translate", map[string]any{
		"messageId":      "msg_fam_1",
		"targetLanguage": "es",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		MessageID       string `json:"messageId"`
		ChannelID       string `json:"channelId"`
		Original        string `json:"original"`
		Translated      string `json:"translated"`
		TargetLanguage  string `json:"targetLanguage"`
		Model           string `json:"model"`
		ComputeLocation string `json:"computeLocation"`
		DataEgressBytes int    `json:"dataEgressBytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.MessageID != "msg_fam_1" {
		t.Errorf("expected messageId echo, got %q", body.MessageID)
	}
	if body.ChannelID == "" {
		t.Errorf("expected channelId, got empty")
	}
	if body.Original == "" {
		t.Errorf("expected non-empty original")
	}
	if body.Translated == "" {
		t.Errorf("expected non-empty translated")
	}
	if body.TargetLanguage != "es" {
		t.Errorf("expected es, got %q", body.TargetLanguage)
	}
	if body.ComputeLocation != "on_device" {
		t.Errorf("expected on_device, got %q", body.ComputeLocation)
	}
	if body.DataEgressBytes != 0 {
		t.Errorf("expected zero egress, got %d", body.DataEgressBytes)
	}
}

func TestTranslateDefaultsTargetLanguageToEnglish(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/translate", map[string]any{
		"messageId": "msg_fam_1",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		TargetLanguage string `json:"targetLanguage"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.TargetLanguage != "en" {
		t.Errorf("expected default en, got %q", body.TargetLanguage)
	}
}

func TestTranslateRejectsMissingMessageID(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/translate", map[string]any{})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestTranslate404OnUnknownMessage(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/translate", map[string]any{
		"messageId": "msg_does_not_exist",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}
