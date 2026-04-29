package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Policy is the HTTP surface for the per-workspace AI policy. Handlers:
//
//   - GET    /api/workspaces/{id}/policy   — return current policy
//   - PATCH  /api/workspaces/{id}/policy   — update fields
//
// Phase 6 demo: any user is allowed to PATCH; admin-only enforcement is
// deferred to the production-hardening phase.
type Policy struct {
	policy *services.PolicyService
}

func NewPolicy(p *services.PolicyService) *Policy {
	return &Policy{policy: p}
}

func (h *Policy) Get(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	pol, err := h.policy.Get(wsID)
	if err != nil {
		if errors.Is(err, services.ErrPolicyNotFound) {
			writeJSONError(w, http.StatusNotFound, "workspace policy not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"policy": pol})
}

func (h *Policy) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	var patch services.PolicyPatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if u, ok := userctx.From(r.Context()); ok && patch.UpdatedBy == "" {
		patch.UpdatedBy = u.ID
	}
	pol, err := h.policy.Update(wsID, patch)
	if err != nil {
		if errors.Is(err, services.ErrPolicyNotFound) {
			writeJSONError(w, http.StatusNotFound, "workspace policy not found")
			return
		}
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"policy": pol})
}
