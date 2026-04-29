package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// Phase 5 knowledge graph — extraction, kind filtering, channel
// scoping, single-entity GET, and 404 surfaces.

func TestExtractKnowledgeReturnsEntitiesForVendorThread(t *testing.T) {
	h := newTestServer()

	rec := doRequest(t, h, "POST", "/api/channels/ch_vendor_management/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Entities) == 0 {
		t.Fatalf("expected at least one extracted entity for vendor-management, got 0")
	}
	for _, e := range body.Entities {
		if e.ChannelID != "ch_vendor_management" {
			t.Errorf("entity %s leaked from another channel: got channelId=%s", e.ID, e.ChannelID)
		}
		if e.SourceMessageID == "" {
			t.Errorf("entity %s missing sourceMessageId", e.ID)
		}
		if e.Kind == "" {
			t.Errorf("entity %s missing kind", e.ID)
		}
		if e.Status != models.KnowledgeEntityStatusOpen {
			t.Errorf("entity %s expected status=open, got %s", e.ID, e.Status)
		}
	}

	// vendor-management has decision / risk / requirement language
	// in its seeded thread (PROGRESS.md / seed.go) — assert at
	// least one of each kind is present.
	kinds := map[models.KnowledgeEntityKind]int{}
	for _, e := range body.Entities {
		kinds[e.Kind]++
	}
	for _, want := range []models.KnowledgeEntityKind{
		models.KnowledgeEntityKindDecision,
		models.KnowledgeEntityKindRisk,
		models.KnowledgeEntityKindRequirement,
	} {
		if kinds[want] == 0 {
			t.Errorf("expected at least one %s entity, kinds=%v", want, kinds)
		}
	}
}

func TestExtractKnowledgeUnknownChannel404(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, "POST", "/api/channels/ch_unknown/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListKnowledgeFiltersByKind(t *testing.T) {
	h := newTestServer()
	// Seed the graph by extracting first.
	rec := doRequest(t, h, "POST", "/api/channels/ch_vendor_management/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("seed extract: expected 200, got %d", rec.Code)
	}

	rec = doGet(t, h, "/api/channels/ch_vendor_management/knowledge?kind=risk", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Entities) == 0 {
		t.Fatalf("expected at least one risk entity for vendor-management")
	}
	for _, e := range body.Entities {
		if e.Kind != models.KnowledgeEntityKindRisk {
			t.Errorf("expected kind=risk, got %s for %s", e.Kind, e.ID)
		}
	}

	// Empty kind returns every kind.
	rec = doGet(t, h, "/api/channels/ch_vendor_management/knowledge", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("unfiltered list: expected 200, got %d", rec.Code)
	}
	var all struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &all); err != nil {
		t.Fatalf("decode all: %v", err)
	}
	if len(all.Entities) <= len(body.Entities) {
		t.Errorf("expected unfiltered list to include more than just risk entities (got %d total vs %d risks)",
			len(all.Entities), len(body.Entities))
	}
}

func TestListKnowledgeChannelScoping(t *testing.T) {
	h := newTestServer()
	// Extract for vendor-management only.
	rec := doRequest(t, h, "POST", "/api/channels/ch_vendor_management/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("seed extract: expected 200, got %d", rec.Code)
	}

	// Engineering hasn't been extracted yet — its list should be
	// empty even though vendor-management has entities.
	rec = doGet(t, h, "/api/channels/ch_engineering/knowledge", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("engineering list: expected 200, got %d", rec.Code)
	}
	var body struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Entities) != 0 {
		t.Errorf("expected 0 entities for engineering (not yet extracted), got %d", len(body.Entities))
	}

	// And vendor-management entities never list anything outside
	// the requested channel.
	rec = doGet(t, h, "/api/channels/ch_vendor_management/knowledge", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("vendor list: expected 200, got %d", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode vendor: %v", err)
	}
	for _, e := range body.Entities {
		if e.ChannelID != "ch_vendor_management" {
			t.Errorf("cross-channel leak: %s in %s", e.ID, e.ChannelID)
		}
	}
}

func TestListKnowledgeUnknownChannel404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/channels/ch_unknown/knowledge", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetKnowledgeEntityByID(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, "POST", "/api/channels/ch_vendor_management/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("seed extract: expected 200, got %d", rec.Code)
	}
	var body struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Entities) == 0 {
		t.Fatalf("no entities to look up")
	}
	want := body.Entities[0]

	rec = doGet(t, h, "/api/knowledge/"+want.ID, "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var single struct {
		Entity models.KnowledgeEntity `json:"entity"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &single); err != nil {
		t.Fatalf("decode single: %v", err)
	}
	if single.Entity.ID != want.ID {
		t.Errorf("expected id=%s, got %s", want.ID, single.Entity.ID)
	}
}

func TestGetKnowledgeEntityUnknown404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/knowledge/kg_unknown", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestExtractKnowledgeIsIdempotent(t *testing.T) {
	h := newTestServer()
	// Run extraction twice — entities should not double up.
	rec := doRequest(t, h, "POST", "/api/channels/ch_vendor_management/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("first extract: expected 200, got %d", rec.Code)
	}
	var first struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &first)

	rec = doRequest(t, h, "POST", "/api/channels/ch_vendor_management/knowledge/extract", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("second extract: expected 200, got %d", rec.Code)
	}
	var second struct {
		Entities []models.KnowledgeEntity `json:"entities"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &second)

	if len(second.Entities) != len(first.Entities) {
		t.Errorf("expected re-extraction to be idempotent, got %d vs %d entities",
			len(first.Entities), len(second.Entities))
	}
}
