package services

import (
	"errors"
	"strings"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// ErrConnectorChannelMismatch is returned when an attach call targets
// a channel that does not belong to the connector's workspace.
var ErrConnectorChannelMismatch = errors.New("connectors: channel does not belong to connector workspace")

// ConnectorService exposes the Phase 5 mock-connector API. It is
// backed by the in-memory store and intentionally avoids any real
// OAuth / external API calls — Phase 5 ships one seeded Google Drive
// connector per workspace plus a small file library.
type ConnectorService struct {
	store *store.Memory
}

// NewConnectorService constructs the service.
func NewConnectorService(s *store.Memory) *ConnectorService {
	return &ConnectorService{store: s}
}

// List returns connectors visible in `workspaceID`. Empty workspaceID
// returns every connector.
func (s *ConnectorService) List(workspaceID string) []models.Connector {
	return s.store.ListConnectors(workspaceID)
}

// Get returns a single connector by ID. ErrNotFound when the
// connector does not exist.
func (s *ConnectorService) Get(id string) (models.Connector, error) {
	c, ok := s.store.GetConnector(id)
	if !ok {
		return models.Connector{}, ErrNotFound
	}
	return c, nil
}

// ListFiles returns every file stored for `connectorID`. Returns
// ErrNotFound if the connector itself is unknown so handlers can
// surface a 404 rather than an empty list.
func (s *ConnectorService) ListFiles(connectorID string) ([]models.ConnectorFile, error) {
	if _, ok := s.store.GetConnector(connectorID); !ok {
		return nil, ErrNotFound
	}
	return s.store.ListConnectorFiles(connectorID), nil
}

// ListFilesByChannel returns every file accessible from `channelID`
// via attached connectors. The result is the privacy-bounded view
// the SourcePicker / PermissionPreview render — files from
// unattached connectors are not visible.
func (s *ConnectorService) ListFilesByChannel(channelID string) []models.ConnectorFile {
	return s.store.ListConnectorFilesByChannel(channelID)
}

// AttachToChannel adds `channelID` to the connector's attached
// channels. Idempotent: re-attaching the same channel is a no-op,
// even under concurrent calls. Returns ErrUnknownChannel if the
// channel does not exist, and ErrConnectorChannelMismatch if the
// channel belongs to a different workspace from the connector.
//
// The dup check runs *inside* the UpdateConnector callback so it
// reads the current channel list under the store's write lock —
// otherwise two concurrent attaches with the same channelID could
// both pass a stale snapshot check and double-append.
func (s *ConnectorService) AttachToChannel(connectorID, channelID string) (models.Connector, error) {
	c, ok := s.store.GetConnector(connectorID)
	if !ok {
		return models.Connector{}, ErrNotFound
	}
	ch, ok := s.store.GetChannel(channelID)
	if !ok {
		return models.Connector{}, ErrUnknownChannel
	}
	if ch.WorkspaceID != c.WorkspaceID {
		return models.Connector{}, ErrConnectorChannelMismatch
	}
	updated, _ := s.store.UpdateConnector(connectorID, func(cc *models.Connector) {
		for _, cid := range cc.ChannelIDs {
			if cid == channelID {
				return
			}
		}
		cc.ChannelIDs = append(cc.ChannelIDs, channelID)
	})
	return updated, nil
}

// DetachFromChannel removes `channelID` from the connector's
// attached channels. Idempotent: detaching a channel that isn't
// attached is a no-op.
func (s *ConnectorService) DetachFromChannel(connectorID, channelID string) (models.Connector, error) {
	c, ok := s.store.GetConnector(connectorID)
	if !ok {
		return models.Connector{}, ErrNotFound
	}
	if !contains(c.ChannelIDs, channelID) {
		return c, nil
	}
	updated, _ := s.store.UpdateConnector(connectorID, func(cc *models.Connector) {
		out := make([]string, 0, len(cc.ChannelIDs))
		for _, cid := range cc.ChannelIDs {
			if cid == channelID {
				continue
			}
			out = append(out, cid)
		}
		cc.ChannelIDs = out
	})
	return updated, nil
}

// SyncACL refreshes the machine-readable `ACL` field on every file
// belonging to `connectorID`. Phase 5 ships a mock that derives ACL
// from the human-readable `Permissions` strings ("alice@acme.com:owner"
// → "user_alice"); a real OAuth sync against Drive / OneDrive / GitHub
// ships in Phase 6+. Returns the updated files plus ErrNotFound when
// the connector itself is unknown so handlers can surface a 404.
func (s *ConnectorService) SyncACL(connectorID string) ([]models.ConnectorFile, error) {
	if _, ok := s.store.GetConnector(connectorID); !ok {
		return nil, ErrNotFound
	}
	updated := s.store.UpdateConnectorFile(connectorID, func(f *models.ConnectorFile) {
		f.ACL = deriveACLFromPermissions(f.Permissions)
	})
	return updated, nil
}

// CheckFileAccess returns true when `userID` is in the file's ACL
// (or when the file has no ACL configured — empty ACL is treated as
// "ungated", matching the demo seed before SyncACL has been called).
// Returns false + ErrNotFound when the file is unknown.
func (s *ConnectorService) CheckFileAccess(fileID, userID string) (bool, error) {
	f, ok := s.store.GetConnectorFile(fileID)
	if !ok {
		return false, ErrNotFound
	}
	return fileACLAllows(f, userID), nil
}

// fileACLAllows is the internal predicate used by retrieval and the
// source picker. Empty ACL falls open so seeded files without an
// explicit sync still flow through the demo.
func fileACLAllows(f models.ConnectorFile, userID string) bool {
	if len(f.ACL) == 0 {
		return true
	}
	for _, u := range f.ACL {
		if u == userID {
			return true
		}
	}
	return false
}

// deriveACLFromPermissions converts the seeded "alice@acme.com:owner"
// style permission strings into Phase 0 user IDs. The mapping is
// purely pattern-based: take the local-part of the email and prefix
// it with "user_" (so "alice@acme.com:editor" → "user_alice"). When
// the input is already a user ID we keep it verbatim.
func deriveACLFromPermissions(perms []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, p := range perms {
		if p == "" {
			continue
		}
		// Strip ":<role>" suffix.
		if idx := strings.Index(p, ":"); idx >= 0 {
			p = p[:idx]
		}
		// "alice@acme.com" → "alice"
		if idx := strings.Index(p, "@"); idx >= 0 {
			p = "user_" + p[:idx]
		}
		if !strings.HasPrefix(p, "user_") {
			p = "user_" + p
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}
