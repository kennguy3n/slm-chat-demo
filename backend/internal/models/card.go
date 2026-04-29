package models

// CardKind tags a KApp card so the frontend's KAppCardRenderer can dispatch
// to the correct component.
type CardKind string

const (
	CardKindTask     CardKind = "task"
	CardKindApproval CardKind = "approval"
	CardKindArtifact CardKind = "artifact"
	CardKindEvent    CardKind = "event"
)

// Card is the wire envelope for a KApp card returned by GET /api/kapps/cards.
// Exactly one of Task / Approval / Artifact / Event is populated, matched by
// Kind. The wrapper exists so the frontend can render heterogeneous lists
// (mixed task / approval / artifact / event) without per-kind endpoints.
//
// ThreadID is a denormalised back-link so the linked-objects endpoint can
// return every card attached to a thread without scanning every embedded
// payload. It mirrors the Task.SourceThreadID / Approval.SourceThreadID /
// Artifact source refs so the existing demo cards remain wire-compatible.
type Card struct {
	Kind     CardKind  `json:"kind"`
	ThreadID string    `json:"threadId,omitempty"`
	Task     *Task     `json:"task,omitempty"`
	Approval *Approval `json:"approval,omitempty"`
	Artifact *Artifact `json:"artifact,omitempty"`
	Event    *Event    `json:"event,omitempty"`
}
