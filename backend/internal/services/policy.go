package services

import (
	"errors"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// PolicyService manages per-workspace AI compute policies — the
// allow/deny lists, daily egress cap, and master "allow server" switch
// that the inference router consults before dispatching anything to the
// confidential-server tier.
type PolicyService struct {
	store *store.Memory
	now   func() time.Time
}

// ErrPolicyNotFound is returned when no policy is seeded for the
// requested workspace.
var ErrPolicyNotFound = errors.New("workspace policy not found")

// NewPolicyService constructs a PolicyService backed by the given
// memory store.
func NewPolicyService(s *store.Memory) *PolicyService {
	return &PolicyService{store: s, now: time.Now}
}

// Get returns the policy for a workspace. Returns ErrPolicyNotFound if
// no policy has been seeded yet.
func (p *PolicyService) Get(workspaceID string) (models.WorkspacePolicy, error) {
	pol, ok := p.store.GetWorkspacePolicy(workspaceID)
	if !ok {
		return models.WorkspacePolicy{}, ErrPolicyNotFound
	}
	return pol, nil
}

// PolicyPatch is the partial-update shape accepted by `Update`. Each
// field is a pointer so the handler can distinguish "not provided" from
// "explicit zero value".
type PolicyPatch struct {
	AllowServerCompute   *bool     `json:"allowServerCompute,omitempty"`
	ServerAllowedTasks   *[]string `json:"serverAllowedTasks,omitempty"`
	ServerDeniedTasks    *[]string `json:"serverDeniedTasks,omitempty"`
	MaxEgressBytesPerDay *int64    `json:"maxEgressBytesPerDay,omitempty"`
	RequireRedaction     *bool     `json:"requireRedaction,omitempty"`
	UpdatedBy            string    `json:"updatedBy,omitempty"`
}

// Update applies the patch to the existing workspace policy. Returns
// ErrPolicyNotFound if the workspace has no policy yet — callers
// should respond 404 in that case.
func (p *PolicyService) Update(workspaceID string, patch PolicyPatch) (models.WorkspacePolicy, error) {
	pol, ok := p.store.GetWorkspacePolicy(workspaceID)
	if !ok {
		return models.WorkspacePolicy{}, ErrPolicyNotFound
	}
	if patch.AllowServerCompute != nil {
		pol.AllowServerCompute = *patch.AllowServerCompute
	}
	if patch.ServerAllowedTasks != nil {
		pol.ServerAllowedTasks = *patch.ServerAllowedTasks
	}
	if patch.ServerDeniedTasks != nil {
		pol.ServerDeniedTasks = *patch.ServerDeniedTasks
	}
	if patch.MaxEgressBytesPerDay != nil {
		pol.MaxEgressBytesPerDay = *patch.MaxEgressBytesPerDay
	}
	if patch.RequireRedaction != nil {
		pol.RequireRedaction = *patch.RequireRedaction
	}
	if patch.UpdatedBy != "" {
		pol.UpdatedBy = patch.UpdatedBy
	}
	pol.UpdatedAt = p.now()
	p.store.PutWorkspacePolicy(pol)
	return pol, nil
}
