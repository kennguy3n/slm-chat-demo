package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// TestSyncACLEndpointPopulatesACL verifies that POST
// /api/connectors/{id}/sync-acl returns the updated file list with
// each file's `acl` field populated from the human-readable
// permissions strings.
func TestSyncACLEndpointPopulatesACL(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, "POST", "/api/connectors/conn_gdrive_acme/sync-acl", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		ConnectorID string                  `json:"connectorId"`
		Files       []models.ConnectorFile  `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.ConnectorID != "conn_gdrive_acme" {
		t.Errorf("connectorId = %q, want conn_gdrive_acme", body.ConnectorID)
	}
	if len(body.Files) == 0 {
		t.Fatalf("expected non-zero files in sync response")
	}
	for _, f := range body.Files {
		if len(f.ACL) == 0 {
			t.Errorf("file %s ACL empty after sync", f.ID)
		}
	}
}

// TestSyncACLEndpointUnknownConnectorReturns404 ensures the handler
// surfaces a 404 when the connector is unknown.
func TestSyncACLEndpointUnknownConnectorReturns404(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, "POST", "/api/connectors/conn_unknown/sync-acl", "user_alice", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestListConnectorsReturnsSeededDriveConnector(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/connectors?workspaceId=ws_acme", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Connectors []models.Connector `json:"connectors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Phase 5 ships two seeded connectors per acme workspace: a
	// Google Drive connector (vendor-management) and a OneDrive
	// connector (engineering).
	var gdrive *models.Connector
	for i := range body.Connectors {
		if body.Connectors[i].ID == "conn_gdrive_acme" {
			gdrive = &body.Connectors[i]
		}
	}
	if gdrive == nil {
		t.Fatalf("expected conn_gdrive_acme in workspace connectors, got %+v", body.Connectors)
	}
	if gdrive.Kind != models.ConnectorKindGoogleDrive {
		t.Errorf("expected kind=google_drive, got %q", gdrive.Kind)
	}
	if gdrive.Status != models.ConnectorStatusConnected {
		t.Errorf("expected status=connected, got %q", gdrive.Status)
	}
}

// TestListConnectorsReturnsOneDriveConnector verifies the second
// Phase 5 seeded connector — a mocked OneDrive integration attached
// to ch_engineering — is surfaced for the acme workspace.
func TestListConnectorsReturnsOneDriveConnector(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/connectors?workspaceId=ws_acme", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Connectors []models.Connector `json:"connectors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	var onedrive *models.Connector
	for i := range body.Connectors {
		if body.Connectors[i].ID == "conn_onedrive_acme" {
			onedrive = &body.Connectors[i]
		}
	}
	if onedrive == nil {
		t.Fatalf("expected conn_onedrive_acme in workspace connectors, got %+v", body.Connectors)
	}
	if onedrive.Kind != models.ConnectorKindOneDrive {
		t.Errorf("expected kind=onedrive, got %q", onedrive.Kind)
	}
	if onedrive.Name != "Acme OneDrive" {
		t.Errorf("expected name=Acme OneDrive, got %q", onedrive.Name)
	}
	attached := false
	for _, cid := range onedrive.ChannelIDs {
		if cid == "ch_engineering" {
			attached = true
		}
	}
	if !attached {
		t.Errorf("expected OneDrive connector attached to ch_engineering, got %v", onedrive.ChannelIDs)
	}
}

// TestOneDriveFilesReturnedForAttachedChannel verifies the engineering
// channel sees its OneDrive files via the channel-scoped files
// endpoint after seed time.
func TestOneDriveFilesReturnedForAttachedChannel(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/channels/ch_engineering/connector-files", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Files []models.ConnectorFile `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Files) == 0 {
		t.Fatalf("expected files for ch_engineering, got 0")
	}
	for _, f := range body.Files {
		if f.ConnectorID != "conn_onedrive_acme" {
			t.Errorf("expected file %s scoped to OneDrive connector, got %q", f.ID, f.ConnectorID)
		}
		if f.Excerpt == "" {
			t.Errorf("OneDrive file %s missing excerpt", f.ID)
		}
	}
}

func TestListConnectorsScopesByWorkspace(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/connectors?workspaceId=ws_personal", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Connectors []models.Connector `json:"connectors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Connectors) != 0 {
		t.Fatalf("expected 0 connectors for personal workspace, got %d", len(body.Connectors))
	}
}

func TestGetConnectorReturns200And404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/connectors/conn_gdrive_acme", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doGet(t, h, "/api/connectors/conn_unknown", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestListConnectorFilesReturnsSeededFiles(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/connectors/conn_gdrive_acme/files", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Files []models.ConnectorFile `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Files) < 3 {
		t.Fatalf("expected at least 3 seeded files, got %d", len(body.Files))
	}
	for _, f := range body.Files {
		if f.ConnectorID != "conn_gdrive_acme" {
			t.Errorf("expected connectorId=conn_gdrive_acme, got %q", f.ConnectorID)
		}
		if f.Excerpt == "" {
			t.Errorf("file %s missing excerpt", f.ID)
		}
	}
}

func TestListConnectorFilesUnknownConnector404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/connectors/conn_unknown/files", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestChannelConnectorFilesReturnsAttachedFiles(t *testing.T) {
	h := newTestServer()
	// vendor-management has the connector attached at seed time; its
	// channel-files endpoint should mirror the connector's files.
	rec := doGet(t, h, "/api/channels/ch_vendor_management/connector-files", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Files []models.ConnectorFile `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Files) == 0 {
		t.Fatalf("expected attached files for vendor-management, got 0")
	}

	// ch_general has no connectors attached at seed time.
	rec = doGet(t, h, "/api/channels/ch_general/connector-files", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode general: %v", err)
	}
	if len(body.Files) != 0 {
		t.Fatalf("expected 0 files for unattached channel, got %d", len(body.Files))
	}
}

func TestAttachAndDetachChannel(t *testing.T) {
	h := newTestServer()

	// Attach the gdrive connector to ch_general (which has no
	// connectors attached at seed time — ch_engineering is now
	// owned by the OneDrive seed).
	body := bytes.NewBufferString(`{"channelId":"ch_general"}`)
	rec := doRequest(t, h, "POST", "/api/connectors/conn_gdrive_acme/channels", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("attach: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var attach struct {
		Connector models.Connector `json:"connector"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &attach); err != nil {
		t.Fatalf("decode attach: %v", err)
	}
	found := false
	for _, cid := range attach.Connector.ChannelIDs {
		if cid == "ch_general" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected ch_general in channelIds, got %v", attach.Connector.ChannelIDs)
	}

	// ch_general should now see the gdrive connector's files.
	rec = doGet(t, h, "/api/channels/ch_general/connector-files", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("post-attach files: expected 200, got %d", rec.Code)
	}
	var filesBody struct {
		Files []models.ConnectorFile `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &filesBody); err != nil {
		t.Fatalf("decode files: %v", err)
	}
	if len(filesBody.Files) == 0 {
		t.Fatalf("expected files visible from ch_general after attach, got 0")
	}

	// Detach.
	rec = doRequest(t, h, "DELETE", "/api/connectors/conn_gdrive_acme/channels/ch_general", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("detach: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doGet(t, h, "/api/channels/ch_general/connector-files", "user_alice")
	if err := json.Unmarshal(rec.Body.Bytes(), &filesBody); err != nil {
		t.Fatalf("decode post-detach: %v", err)
	}
	if len(filesBody.Files) != 0 {
		t.Fatalf("expected 0 files after detach, got %d", len(filesBody.Files))
	}
}

func TestAttachRejectsUnknownChannel(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelId":"ch_unknown"}`)
	rec := doRequest(t, h, "POST", "/api/connectors/conn_gdrive_acme/channels", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAttachRejectsCrossWorkspaceChannel(t *testing.T) {
	h := newTestServer()
	// ws_personal channel must not be attachable to an Acme connector.
	body := bytes.NewBufferString(`{"channelId":"ch_dm_alice_bob"}`)
	rec := doRequest(t, h, "POST", "/api/connectors/conn_gdrive_acme/channels", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for cross-workspace attach, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAttachUnknownConnectorReturns404(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelId":"ch_engineering"}`)
	rec := doRequest(t, h, "POST", "/api/connectors/conn_unknown/channels", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

// Regression for the TOCTOU between the stale dup-check snapshot and
// the UpdateConnector write — two sequential attaches with the same
// channelId must result in exactly one entry in `channelIds`. Before
// the fix the dup check ran against a stale GetConnector snapshot, so
// concurrent / repeat callers could double-append.
func TestAttachIsIdempotentForRepeatedChannel(t *testing.T) {
	h := newTestServer()

	body1 := bytes.NewBufferString(`{"channelId":"ch_general"}`)
	rec := doRequest(t, h, "POST", "/api/connectors/conn_gdrive_acme/channels", "user_alice", body1)
	if rec.Code != http.StatusOK {
		t.Fatalf("first attach: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	body2 := bytes.NewBufferString(`{"channelId":"ch_general"}`)
	rec = doRequest(t, h, "POST", "/api/connectors/conn_gdrive_acme/channels", "user_alice", body2)
	if rec.Code != http.StatusOK {
		t.Fatalf("second attach: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Connector models.Connector `json:"connector"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	count := 0
	for _, cid := range resp.Connector.ChannelIDs {
		if cid == "ch_general" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected ch_general once in channelIds, got %d (channelIds=%v)",
			count, resp.Connector.ChannelIDs)
	}
}
