package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

type retrievalSearchBody struct {
	ChannelID string                   `json:"channelId"`
	Query     string                   `json:"query"`
	Results   []models.RetrievalResult `json:"results"`
}

func TestIndexAndSearchVendorChannelReturnsAttribution(t *testing.T) {
	h := newTestServer()

	// Index the vendor-management channel.
	rec := doRequest(t, h, "POST", "/api/channels/ch_vendor_management/index", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("index: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var idx struct {
		ChunkCount int `json:"chunkCount"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &idx); err != nil {
		t.Fatalf("decode index: %v", err)
	}
	if idx.ChunkCount == 0 {
		t.Fatalf("expected non-zero chunkCount after indexing")
	}

	// Search for "vendor" — should hit at least one message and the
	// vendor contract file (excerpt mentions "Acme Logs Inc").
	q := url.Values{}
	q.Set("q", "vendor pricing")
	q.Set("topK", "5")
	rec = doGet(t, h, "/api/channels/ch_vendor_management/search?"+q.Encode(), "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("search: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body retrievalSearchBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode search: %v", err)
	}
	if len(body.Results) == 0 {
		t.Fatalf("expected at least one result for 'vendor pricing'")
	}
	for _, r := range body.Results {
		if r.Chunk.ChannelID != "ch_vendor_management" {
			t.Errorf("expected chunks scoped to ch_vendor_management, got %q", r.Chunk.ChannelID)
		}
		if r.Chunk.SourceID == "" {
			t.Errorf("expected sourceId attribution, got empty")
		}
		if r.Score <= 0 {
			t.Errorf("expected positive score, got %v", r.Score)
		}
	}
}

func TestSearchEmptyQueryReturnsEmpty(t *testing.T) {
	h := newTestServer()
	doRequest(t, h, "POST", "/api/channels/ch_vendor_management/index", "user_alice", nil)
	rec := doGet(t, h, "/api/channels/ch_vendor_management/search?q=", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body retrievalSearchBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Results) != 0 {
		t.Fatalf("expected 0 results for empty query, got %d", len(body.Results))
	}
}

func TestSearchNoMatchReturnsEmpty(t *testing.T) {
	h := newTestServer()
	doRequest(t, h, "POST", "/api/channels/ch_vendor_management/index", "user_alice", nil)
	rec := doGet(t, h, "/api/channels/ch_vendor_management/search?q=helicopter+platypus", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body retrievalSearchBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Results) != 0 {
		t.Fatalf("expected 0 results for no-match query, got %d", len(body.Results))
	}
}

func TestSearchUnknownChannelReturns404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/channels/ch_unknown/search?q=vendor", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestIndexUnknownChannelReturns404(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, "POST", "/api/channels/ch_unknown/index", "user_alice", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestSearchRespectsChannelScoping(t *testing.T) {
	h := newTestServer()
	// Index both channels and verify a vendor-only file does not leak
	// into engineering's search results.
	doRequest(t, h, "POST", "/api/channels/ch_vendor_management/index", "user_alice", nil)
	doRequest(t, h, "POST", "/api/channels/ch_engineering/index", "user_alice", nil)

	q := url.Values{}
	q.Set("q", "vendor termination soc")
	rec := doGet(t, h, "/api/channels/ch_engineering/search?"+q.Encode(), "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body retrievalSearchBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, r := range body.Results {
		if r.Chunk.SourceKind == models.RetrievalSourceKindFile {
			t.Errorf("expected no file chunks in engineering (no connector attached); got file %q", r.Chunk.SourceID)
		}
		if r.Chunk.ChannelID != "ch_engineering" {
			t.Errorf("cross-channel leakage: %q", r.Chunk.ChannelID)
		}
	}
}
