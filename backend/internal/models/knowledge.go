package models

import "time"

// KnowledgeEntityKind enumerates the five entity types the Phase 5
// knowledge graph extracts from channel threads. Each kind groups
// extracted entities into the corresponding right-rail section in
// the KnowledgeGraphPanel and lets handlers narrow listing queries
// without scanning every entity.
type KnowledgeEntityKind string

const (
	KnowledgeEntityKindDecision    KnowledgeEntityKind = "decision"
	KnowledgeEntityKindOwner       KnowledgeEntityKind = "owner"
	KnowledgeEntityKindRisk        KnowledgeEntityKind = "risk"
	KnowledgeEntityKindRequirement KnowledgeEntityKind = "requirement"
	KnowledgeEntityKindDeadline    KnowledgeEntityKind = "deadline"
)

// KnowledgeEntityStatus captures the lifecycle phase of a tracked
// entity. Phase 5 only ever stamps entities as `open` at extraction
// time; `resolved` / `accepted` are reserved for a future review-gate
// flow where a workspace member confirms the AI-derived entity.
type KnowledgeEntityStatus string

const (
	KnowledgeEntityStatusOpen     KnowledgeEntityStatus = "open"
	KnowledgeEntityStatusResolved KnowledgeEntityStatus = "resolved"
	KnowledgeEntityStatusAccepted KnowledgeEntityStatus = "accepted"
)

// KnowledgeEntity is a single structured fact derived from a thread
// message — a decision, an assigned owner, a risk, a requirement, or
// a deadline. Every entity references its `SourceMessageID` so the
// renderer can link the chip back to the originating message via the
// `#message-{id}` anchor pattern used elsewhere in the demo.
//
// The shape mirrors the citation envelope used by the existing
// CitationRenderer so AI Employees can ground prompts in entities
// (e.g. "the QBR deadline is 2026-05-15 [source:msg_qbr_due]")
// without inventing a new attribution scheme.
type KnowledgeEntity struct {
	ID              string                `json:"id"`
	ChannelID       string                `json:"channelId"`
	ThreadID        string                `json:"threadId,omitempty"`
	SourceMessageID string                `json:"sourceMessageId"`
	Kind            KnowledgeEntityKind   `json:"kind"`
	Title           string                `json:"title"`
	Description     string                `json:"description"`
	Actors          []string              `json:"actors,omitempty"`
	DueDate         *time.Time            `json:"dueDate,omitempty"`
	Status          KnowledgeEntityStatus `json:"status"`
	CreatedAt       time.Time             `json:"createdAt"`
	Confidence      float64               `json:"confidence"`
}
