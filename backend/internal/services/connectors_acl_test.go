package services_test

import (
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// TestSyncACLUpdatesFilePermissions verifies that calling SyncACL on
// the seeded Drive connector populates the machine-readable ACL list
// on every one of its files. Phase 5 derives the ACL from the
// human-readable Permissions strings.
func TestSyncACLUpdatesFilePermissions(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	svc := services.NewConnectorService(mem)

	files, err := svc.SyncACL("conn_gdrive_acme")
	if err != nil {
		t.Fatalf("sync-acl: %v", err)
	}
	if len(files) == 0 {
		t.Fatalf("expected non-zero files after sync, got 0")
	}
	for _, f := range files {
		if len(f.ACL) == 0 {
			t.Errorf("file %s has empty ACL after sync", f.ID)
		}
		// Every file's permission list begins with "alice@acme.com:..."
		// so user_alice must be in the derived ACL.
		seen := false
		for _, u := range f.ACL {
			if u == "user_alice" {
				seen = true
			}
		}
		if !seen {
			t.Errorf("file %s ACL=%v missing user_alice (derived from %v)", f.ID, f.ACL, f.Permissions)
		}
	}
}

// TestSyncACLUnknownConnectorReturnsErrNotFound exercises the 404
// branch so the handler can map it to an HTTP 404.
func TestSyncACLUnknownConnectorReturnsErrNotFound(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	svc := services.NewConnectorService(mem)
	if _, err := svc.SyncACL("conn_unknown"); err == nil {
		t.Fatalf("expected error for unknown connector, got nil")
	}
}

// TestCheckFileAccessRespectsACL verifies the predicate distinguishes
// users in the seeded ACL from users not in it. user_eve has no ACL
// access on any file per the demo seed; user_alice has access to
// everything.
func TestCheckFileAccessRespectsACL(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	svc := services.NewConnectorService(mem)

	allowed, err := svc.CheckFileAccess("file_acme_q3_prd", "user_alice")
	if err != nil {
		t.Fatalf("alice: %v", err)
	}
	if !allowed {
		t.Errorf("expected alice to be allowed on file_acme_q3_prd")
	}

	allowed, err = svc.CheckFileAccess("file_acme_q3_prd", "user_eve")
	if err != nil {
		t.Fatalf("eve: %v", err)
	}
	if allowed {
		t.Errorf("expected eve to be denied on file_acme_q3_prd")
	}
}

// TestIndexChannelRespectsACL re-indexes the vendor-management channel
// twice — once as user_alice (full ACL access) and once as user_eve
// (no ACL access). The eve run must produce strictly fewer chunks
// because the connector files are filtered out.
func TestIndexChannelRespectsACL(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	svc := services.NewRetrievalService(mem)

	aliceCount, err := svc.IndexChannel("ch_vendor_management", "user_alice")
	if err != nil {
		t.Fatalf("alice index: %v", err)
	}
	eveCount, err := svc.IndexChannel("ch_vendor_management", "user_eve")
	if err != nil {
		t.Fatalf("eve index: %v", err)
	}
	if eveCount >= aliceCount {
		t.Fatalf("expected eveCount < aliceCount, got eve=%d alice=%d", eveCount, aliceCount)
	}
}

// TestSearchRespectsACL ensures search results are filtered by ACL
// on the way out, not just at indexing time. This guards against a
// stale-index attack where eve runs Search after alice indexed.
func TestSearchRespectsACL(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	svc := services.NewRetrievalService(mem)

	if _, err := svc.IndexChannel("ch_vendor_management", "user_alice"); err != nil {
		t.Fatalf("index: %v", err)
	}

	aliceResults, err := svc.Search("ch_vendor_management", "vendor pricing", "user_alice", 10)
	if err != nil {
		t.Fatalf("alice search: %v", err)
	}
	eveResults, err := svc.Search("ch_vendor_management", "vendor pricing", "user_eve", 10)
	if err != nil {
		t.Fatalf("eve search: %v", err)
	}
	aliceFileHits := countFileChunks(aliceResults)
	eveFileHits := countFileChunks(eveResults)
	if aliceFileHits == 0 {
		t.Fatalf("expected alice to see file chunks, got %d", aliceFileHits)
	}
	if eveFileHits != 0 {
		t.Fatalf("expected eve to see 0 file chunks, got %d", eveFileHits)
	}
}

func countFileChunks(rs []models.RetrievalResult) int {
	n := 0
	for _, r := range rs {
		if r.Chunk.SourceKind == models.RetrievalSourceKindFile {
			n++
		}
	}
	return n
}
