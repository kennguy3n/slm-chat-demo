package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

func TestWorkspaceDomainsReturnsSeededDomains(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_acme/domains", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Domains []models.Domain `json:"domains"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Domains) != 2 {
		t.Fatalf("expected 2 domains for acme, got %d", len(body.Domains))
	}
	names := map[string]bool{}
	for _, d := range body.Domains {
		names[d.Name] = true
		if d.WorkspaceID != "ws_acme" {
			t.Errorf("expected domain %s to back-link to ws_acme, got %q", d.ID, d.WorkspaceID)
		}
	}
	if !names["Engineering"] || !names["Finance"] {
		t.Errorf("expected Engineering + Finance domains, got %v", names)
	}
}

func TestWorkspaceDomains404ForUnknownWorkspace(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_unknown/domains", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDomainChannelsReturnsScopedChannels(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/domains/dom_eng/channels", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Channels []models.Channel `json:"channels"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Channels) == 0 {
		t.Fatalf("expected at least one engineering channel")
	}
	for _, c := range body.Channels {
		if c.DomainID != "dom_eng" {
			t.Errorf("expected DomainID=dom_eng for %s, got %q", c.ID, c.DomainID)
		}
		if c.WorkspaceID != "ws_acme" {
			t.Errorf("expected WorkspaceID=ws_acme for %s, got %q", c.ID, c.WorkspaceID)
		}
	}
}

func TestDomainChannels404ForUnknownDomain(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/domains/dom_unknown/channels", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
