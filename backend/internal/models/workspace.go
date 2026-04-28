package models

// Context is the shell context a workspace lives in: B2C (personal/family/community)
// or B2B (workspace/domain/channel).
type Context string

const (
	ContextB2C Context = "b2c"
	ContextB2B Context = "b2b"
)

// Workspace is a top-level container for chats and channels. The personal B2C
// workspace and a B2B workspace ("Acme Corp") are seeded on startup.
type Workspace struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Context Context `json:"context"`
	Domains []Domain `json:"domains"`
}

// Domain groups channels inside a B2B workspace (e.g. Engineering, Finance).
// B2C workspaces use a single implicit domain. WorkspaceID back-links to the
// owning workspace so the navigation API can resolve `GET /api/domains/{id}/
// channels` without scanning every workspace.
type Domain struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	WorkspaceID string `json:"workspaceId,omitempty"`
}

// Channel kind covers DMs, family/community groups in B2C and channels/threads
// in B2B.
type ChannelKind string

const (
	ChannelDM        ChannelKind = "dm"
	ChannelFamily    ChannelKind = "family"
	ChannelCommunity ChannelKind = "community"
	ChannelChannel   ChannelKind = "channel"
)

// Channel is a chat surface (a DM, a group, or a B2B channel).
type Channel struct {
	ID          string      `json:"id"`
	WorkspaceID string      `json:"workspaceId"`
	DomainID    string      `json:"domainId,omitempty"`
	Name        string      `json:"name"`
	Kind        ChannelKind `json:"kind"`
	Context     Context     `json:"context"`
	MemberIDs   []string    `json:"memberIds"`
}
