package models

import "time"

// RecipeRunStatus is the lifecycle phase of a recipe run. The renderer
// records a run in the "pending" or "running" state when an AI Employee
// kicks a recipe off, then transitions to "completed" or "failed" once
// the recipe finishes (or errors out).
type RecipeRunStatus string

const (
	RecipeRunStatusPending   RecipeRunStatus = "pending"
	RecipeRunStatusRunning   RecipeRunStatus = "running"
	RecipeRunStatusCompleted RecipeRunStatus = "completed"
	RecipeRunStatusFailed    RecipeRunStatus = "failed"
)

// RecipeRun is a lightweight, in-memory record of a recipe execution
// scoped to an AI Employee. It powers the Phase 4 "Queue view" panel
// in the right rail so a human can see which recipes are pending or
// have recently completed for a given employee.
//
// The renderer is responsible for kicking off the recipe (the executor
// lives in the Electron main process); the backend just stores the
// queue + completion metadata so refreshes / multiple panels stay
// consistent.
type RecipeRun struct {
	ID            string          `json:"id"`
	AIEmployeeID  string          `json:"aiEmployeeId"`
	RecipeID      string          `json:"recipeId"`
	ChannelID     string          `json:"channelId"`
	ThreadID      string          `json:"threadId,omitempty"`
	Status        RecipeRunStatus `json:"status"`
	CreatedAt     time.Time       `json:"createdAt"`
	CompletedAt   *time.Time      `json:"completedAt,omitempty"`
	ResultSummary string          `json:"resultSummary,omitempty"`
}
