package models

import "time"

// ArtifactType enumerates the kinds of long-form documents the Artifacts KApp
// produces (ARCHITECTURE.md section 6.1).
type ArtifactType string

const (
	ArtifactTypePRD      ArtifactType = "PRD"
	ArtifactTypeRFC      ArtifactType = "RFC"
	ArtifactTypeProposal ArtifactType = "Proposal"
	ArtifactTypeSOP      ArtifactType = "SOP"
	ArtifactTypeQBR      ArtifactType = "QBR"
)

// ArtifactStatus tracks whether a draft has been published.
type ArtifactStatus string

const (
	ArtifactStatusDraft     ArtifactStatus = "draft"
	ArtifactStatusInReview  ArtifactStatus = "in_review"
	ArtifactStatusPublished ArtifactStatus = "published"
)

// ArtifactSourceRef is a back-link from an artifact to one of its sources
// (a chat message, a thread, a connector item). Phase 0 only models the
// shape; retrieval lands in Phase 5.
type ArtifactSourceRef struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
	Note string `json:"note,omitempty"`
}

// ArtifactVersion is a single immutable version of an artifact. Versions
// accumulate as drafts are revised; only published versions are sealed in
// the audit log.
type ArtifactVersion struct {
	Version   int       `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
	Author    string    `json:"author"`
	Summary   string    `json:"summary,omitempty"`
}

// Artifact is the Artifacts KApp object from ARCHITECTURE.md section 6.1.
type Artifact struct {
	ID               string              `json:"id"`
	ChannelID        string              `json:"channelId"`
	Type             ArtifactType        `json:"type"`
	Title            string              `json:"title"`
	TemplateID       string              `json:"templateId,omitempty"`
	SourceRefs       []ArtifactSourceRef `json:"sourceRefs,omitempty"`
	Versions         []ArtifactVersion   `json:"versions"`
	Status           ArtifactStatus      `json:"status"`
	PublishedCardID  string              `json:"publishedCardId,omitempty"`
	AIGenerated      bool                `json:"aiGenerated"`
	URL              string              `json:"url,omitempty"`
}
