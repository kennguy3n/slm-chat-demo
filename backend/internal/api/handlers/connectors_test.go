package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

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
	if len(body.Connectors) != 1 {
		t.Fatalf("expected 1 connector for ws_acme, got %d", len(body.Connectors))
	}
	c := body.Connectors[0]
	if c.ID != "conn_gdrive_acme" {
		t.Errorf("expected id=conn_gdrive_acme, got %q", c.ID)
	}
	if c.Kind != models.ConnectorKindGoogleDrive {
		t.Errorf("expected kind=google_drive, got %q", c.Kind)
	}
	if c.Status != models.ConnectorStatusConnected {
		t.Errorf("expected status=connected, got %q", c.Status)
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

	// engineering has no connectors attached at seed time.
	rec = doGet(t, h, "/api/channels/ch_engineering/connector-files", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode engineering: %v", err)
	}
	if len(body.Files) != 0 {
		t.Fatalf("expected 0 files for unattached channel, got %d", len(body.Files))
	}
}

func TestAttachAndDetachChannel(t *testing.T) {
	h := newTestServer()

	// Attach the connector to ch_engineering.
	body := bytes.NewBufferString(`{"channelId":"ch_engineering"}`)
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
		if cid == "ch_engineering" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected ch_engineering in channelIds, got %v", attach.Connector.ChannelIDs)
	}

	// Engineering should now see the connector's files.
	rec = doGet(t, h, "/api/channels/ch_engineering/connector-files", "user_alice")
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
		t.Fatalf("expected files visible from ch_engineering after attach, got 0")
	}

	// Detach.
	rec = doRequest(t, h, "DELETE", "/api/connectors/conn_gdrive_acme/channels/ch_engineering", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("detach: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doGet(t, h, "/api/channels/ch_engineering/connector-files", "user_alice")
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
