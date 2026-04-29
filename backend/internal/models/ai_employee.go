package models

import "time"

// AIEmployeeRole identifies the role an AI Employee plays in a B2B
// workspace (operations, product management, sales). Phase 4 seeds
// one employee per role.
type AIEmployeeRole string

const (
	AIEmployeeRoleOps   AIEmployeeRole = "ops"
	AIEmployeeRolePM    AIEmployeeRole = "pm"
	AIEmployeeRoleSales AIEmployeeRole = "sales"
)

// AIEmployeeMode controls whether an AI Employee runs autonomously
// ("auto") or only surfaces inline suggestions a human operator
// confirms before any KApp write ("inline"). PROPOSAL.md §3.6
// AI Employees.
type AIEmployeeMode string

const (
	AIEmployeeModeAuto   AIEmployeeMode = "auto"
	AIEmployeeModeInline AIEmployeeMode = "inline"
)

// AIEmployeeBudget tracks a per-day token budget so the UI can surface
// how much compute the employee has used so far. Phase 4 ships the
// display-only shape; Phase 4 follow-ups wire the actual token counter
// into the recipe runner.
type AIEmployeeBudget struct {
	MaxTokensPerDay  int `json:"maxTokensPerDay"`
	UsedTokensToday  int `json:"usedTokensToday"`
}

// AIEmployee is a workspace-scoped AI persona pinned to a role, a list
// of channels it is allowed to operate in, and the set of recipes it
// is authorised to run. AI Employee data lives on the Go backend
// (workspace metadata) and is configured from the B2B right rail.
type AIEmployee struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Role              AIEmployeeRole    `json:"role"`
	AvatarColor       string            `json:"avatarColor"`
	Description       string            `json:"description"`
	AllowedChannelIDs []string          `json:"allowedChannelIds"`
	Recipes           []string          `json:"recipes"`
	Budget            AIEmployeeBudget  `json:"budget"`
	Mode              AIEmployeeMode    `json:"mode"`
	CreatedAt         time.Time         `json:"createdAt"`
}

// Canonical seeded employee IDs. They are also the constants the
// frontend uses when wiring recipe execution so the two sides agree on
// identifiers without hard-coding strings everywhere.
const (
	KaraOpsAI   = "ai_kara_ops"
	NinaPMAI    = "ai_nina_pm"
	MikaSalesAI = "ai_mika_sales"
)
