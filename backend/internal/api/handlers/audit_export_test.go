package handlers_test

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// seedSomeAudit triggers a few audit-emitting actions so the export
// endpoint has rows to render.
func seedSomeAudit(t *testing.T, h http.Handler) {
	t.Helper()
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/tasks", "user_alice",
		bytes.NewBufferString(`{"channelId":"ch_vendor_management","title":"Audit export demo"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed task: %d %s", rec.Code, rec.Body.String())
	}
}

func TestAuditExportJSON(t *testing.T) {
	h := newTestServer()
	seedSomeAudit(t, h)
	rec := doGet(t, h, "/api/audit/export?format=json", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	cd := rec.Header().Get("Content-Disposition")
	if !strings.Contains(cd, `audit-export.json`) {
		t.Errorf("expected attachment filename audit-export.json, got %q", cd)
	}
	if !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		t.Errorf("expected JSON content-type, got %q", rec.Header().Get("Content-Type"))
	}
	var entries []models.AuditEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &entries); err != nil {
		t.Fatalf("decode JSON array: %v body=%s", err, rec.Body.String())
	}
	if len(entries) == 0 {
		t.Fatalf("expected at least one entry")
	}
}

func TestAuditExportCSV(t *testing.T) {
	h := newTestServer()
	seedSomeAudit(t, h)
	rec := doGet(t, h, "/api/audit/export?format=csv", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	cd := rec.Header().Get("Content-Disposition")
	if !strings.Contains(cd, `audit-export.csv`) {
		t.Errorf("expected attachment filename audit-export.csv, got %q", cd)
	}
	ct := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("expected text/csv content-type, got %q", ct)
	}
	r := csv.NewReader(strings.NewReader(rec.Body.String()))
	rows, err := r.ReadAll()
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(rows) < 2 {
		t.Fatalf("expected header + at least one data row, got %d rows", len(rows))
	}
	header := rows[0]
	expected := []string{"id", "timestamp", "eventType", "objectKind", "objectId", "actor", "details"}
	if len(header) != len(expected) {
		t.Fatalf("expected %d header columns, got %d (%v)", len(expected), len(header), header)
	}
	for i, col := range expected {
		if header[i] != col {
			t.Errorf("header[%d]: expected %q, got %q", i, col, header[i])
		}
	}
}

func TestAuditExportInvalidFormatReturns400(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/audit/export?format=xml", "user_alice")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
