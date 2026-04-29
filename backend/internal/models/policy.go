package models

import "time"

// WorkspacePolicy is the per-workspace AI compute policy that admins
// configure via PolicyAdminPanel. The router consults this model to
// decide whether a given task may run on the confidential-server tier
// or must stay on-device.
//
// Phase 6 — backed by the in-memory store. Phase 6.5 will move this
// behind PostgreSQL so policy edits survive a backend restart.
type WorkspacePolicy struct {
	WorkspaceID string `json:"workspaceId"`
	// AllowServerCompute is the master switch. When false, no task —
	// regardless of the allow/deny lists — may route to the server.
	AllowServerCompute bool `json:"allowServerCompute"`
	// ServerAllowedTasks is the explicit allow list of TaskType strings
	// (`"draft_artifact"`, `"prefill_approval"`, ...). Empty means no
	// task is allowed even if AllowServerCompute is true.
	ServerAllowedTasks []string `json:"serverAllowedTasks"`
	// ServerDeniedTasks takes precedence over ServerAllowedTasks. A
	// TaskType present here is always blocked from the server tier.
	ServerDeniedTasks []string `json:"serverDeniedTasks"`
	// MaxEgressBytesPerDay caps the total bytes that may be sent to
	// the confidential-server tier per workspace per day. Zero means
	// unlimited (still subject to AllowServerCompute).
	MaxEgressBytesPerDay int64 `json:"maxEgressBytesPerDay"`
	// RequireRedaction forces the redaction engine to tokenize PII
	// before any server-bound dispatch even if a task would otherwise
	// be permitted to send raw context.
	RequireRedaction bool      `json:"requireRedaction"`
	UpdatedAt        time.Time `json:"updatedAt"`
	UpdatedBy        string    `json:"updatedBy"`
}
