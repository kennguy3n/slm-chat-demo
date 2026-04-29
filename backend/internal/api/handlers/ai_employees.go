package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// AIEmployees exposes the Phase 4 workspace-scoped AI Employee API:
//
//	GET    /api/ai-employees                        — list all AI Employees
//	GET    /api/ai-employees/{id}                   — get a single AI Employee
//	PATCH  /api/ai-employees/{id}/channels          — update allowed channels
//	PATCH  /api/ai-employees/{id}/recipes           — update authorised recipes
//	PATCH  /api/ai-employees/{id}/budget            — set the per-day token limit
//	POST   /api/ai-employees/{id}/budget/increment  — atomically bump usage; 429 when exceeded
type AIEmployees struct {
	svc *services.AIEmployeeService
}

// NewAIEmployees constructs the handler.
func NewAIEmployees(s *services.AIEmployeeService) *AIEmployees {
	return &AIEmployees{svc: s}
}

// List handles GET /api/ai-employees.
func (h *AIEmployees) List(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"aiEmployees": h.svc.List()})
}

// Get handles GET /api/ai-employees/{id}.
func (h *AIEmployees) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	e, err := h.svc.Get(id)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aiEmployee": e})
}

type channelsBody struct {
	ChannelIDs []string `json:"channelIds"`
}

// UpdateChannels handles PATCH /api/ai-employees/{id}/channels.
func (h *AIEmployees) UpdateChannels(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body channelsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.ChannelIDs == nil {
		writeJSONError(w, http.StatusBadRequest, "channelIds is required")
		return
	}
	e, err := h.svc.UpdateAllowedChannels(id, body.ChannelIDs)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aiEmployee": e})
}

type recipesBody struct {
	RecipeIDs []string `json:"recipeIds"`
}

// UpdateRecipes handles PATCH /api/ai-employees/{id}/recipes.
func (h *AIEmployees) UpdateRecipes(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body recipesBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.RecipeIDs == nil {
		writeJSONError(w, http.StatusBadRequest, "recipeIds is required")
		return
	}
	e, err := h.svc.UpdateRecipes(id, body.RecipeIDs)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aiEmployee": e})
}

type budgetBody struct {
	MaxTokensPerDay *int `json:"maxTokensPerDay"`
}

// UpdateBudget handles PATCH /api/ai-employees/{id}/budget.
func (h *AIEmployees) UpdateBudget(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body budgetBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.MaxTokensPerDay == nil {
		writeJSONError(w, http.StatusBadRequest, "maxTokensPerDay is required")
		return
	}
	e, err := h.svc.UpdateBudget(id, *body.MaxTokensPerDay)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aiEmployee": e})
}

type budgetIncrementBody struct {
	TokensUsed *int `json:"tokensUsed"`
}

// IncrementBudgetUsage handles POST /api/ai-employees/{id}/budget/increment.
// Returns 429 Too Many Requests when the increment would push the
// employee past its daily ceiling; the body still carries the current
// profile so callers can display the exceeded counters.
func (h *AIEmployees) IncrementBudgetUsage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body budgetIncrementBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.TokensUsed == nil {
		writeJSONError(w, http.StatusBadRequest, "tokensUsed is required")
		return
	}
	e, err := h.svc.IncrementUsage(id, *body.TokensUsed)
	if err != nil {
		if errors.Is(err, services.ErrBudgetExceeded) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"aiEmployee": e,
				"error":      err.Error(),
			})
			return
		}
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aiEmployee": e})
}

func (h *AIEmployees) mapError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, services.ErrNotFound):
		writeJSONError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, services.ErrUnknownChannel):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, services.ErrInvalidBudget):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	default:
		writeJSONError(w, http.StatusBadRequest, err.Error())
	}
}
