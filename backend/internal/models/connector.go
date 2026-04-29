package models

import "time"

// ConnectorKind enumerates the external integrations the Phase 5
// knowledge layer can mock. Real OAuth + APIs are intentionally out
// of scope: Phase 5 ships one seeded `google_drive` connector and
// keeps the other kinds available so the UI can render them as
// "coming soon" rows alongside the seeded source.
type ConnectorKind string

const (
	ConnectorKindGoogleDrive ConnectorKind = "google_drive"
	ConnectorKindOneDrive    ConnectorKind = "onedrive"
	ConnectorKindGitHub      ConnectorKind = "github"
)

// ConnectorStatus is the lifecycle phase of a connector. The Phase 5
// demo only seeds connectors in the `connected` state; `disconnected`
// is reserved for a future detach / re-auth flow.
type ConnectorStatus string

const (
	ConnectorStatusConnected    ConnectorStatus = "connected"
	ConnectorStatusDisconnected ConnectorStatus = "disconnected"
)

// Connector is a workspace-scoped external integration (Drive,
// OneDrive, GitHub) with an explicit per-channel attachment list.
// Channel-scoped attachment is the privacy boundary that gates which
// connector files an AI Employee can read while operating in a given
// channel — see PROPOSAL.md §7 rule 4 ("show sources before
// generation") and ARCHITECTURE.md §6.3 (knowledge graph).
type Connector struct {
	ID          string          `json:"id"`
	Kind        ConnectorKind   `json:"kind"`
	Name        string          `json:"name"`
	WorkspaceID string          `json:"workspaceId"`
	ChannelIDs  []string        `json:"channelIds"`
	Status      ConnectorStatus `json:"status"`
	CreatedAt   time.Time       `json:"createdAt"`
}

// ConnectorFile is a file surfaced through a Connector. The `Excerpt`
// is the first ~200 characters of indexable content; the retrieval
// service uses it as the keyword-matching corpus so the demo can
// ground AI outputs in real source content without shipping a full
// document store. `Permissions` is a flat list of human-readable
// permission strings (e.g. "alice@acme.com:owner") so the
// permission-preview component can show who else can see the file.
type ConnectorFile struct {
	ID          string   `json:"id"`
	ConnectorID string   `json:"connectorId"`
	Name        string   `json:"name"`
	MimeType    string   `json:"mimeType"`
	Size        int      `json:"size"`
	Excerpt     string   `json:"excerpt"`
	URL         string   `json:"url"`
	// Permissions is the human-readable display string ("alice@acme.com:owner").
	Permissions []string `json:"permissions"`
	// ACL is the machine-readable access-control list of user IDs that
	// may read this file. The retrieval index, source picker, and
	// AI-Employee dispatch all gate on ACL membership before exposing
	// the file's content. ConnectorService.SyncACL refreshes this list
	// from the upstream connector (Phase 5 mirrors `Permissions` since
	// no real OAuth call is made; real OAuth sync ships in Phase 6+).
	ACL []string `json:"acl"`
}
