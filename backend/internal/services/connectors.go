package services

import (
	"errors"

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
// channels. Idempotent: re-attaching the same channel is a no-op.
// Returns ErrUnknownChannel if the channel does not exist, and
// ErrConnectorChannelMismatch if the channel belongs to a different
// workspace from the connector.
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
	for _, cid := range c.ChannelIDs {
		if cid == channelID {
			return c, nil
		}
	}
	updated, _ := s.store.UpdateConnector(connectorID, func(cc *models.Connector) {
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

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}
