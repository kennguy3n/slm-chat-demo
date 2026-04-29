package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// RecipeRuns exposes the Phase 4 AI-Employee recipe-run queue:
//
//	GET  /api/ai-employees/{id}/queue — list queued + completed recipe runs
//	POST /api/ai-employees/{id}/queue — record a new recipe run (pending/running)
//
// The renderer owns the recipe executor (Electron main process); the
// backend simply keeps the log so multiple panels / refreshes stay in
// sync.
type RecipeRuns struct {
	svc       *services.RecipeRunService
	employees *services.AIEmployeeService
}

// NewRecipeRuns constructs the handler.
func NewRecipeRuns(svc *services.RecipeRunService, employees *services.AIEmployeeService) *RecipeRuns {
	return &RecipeRuns{svc: svc, employees: employees}
}

// List handles GET /api/ai-employees/{id}/queue.
func (h *RecipeRuns) List(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.employees.Get(id); err != nil {
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	runs := h.svc.List(id)
	writeJSON(w, http.StatusOK, map[string]any{"recipeRuns": runs})
}

type recordRecipeRunBody struct {
	ID            string                 `json:"id"`
	RecipeID      string                 `json:"recipeId"`
	ChannelID     string                 `json:"channelId"`
	ThreadID      string                 `json:"threadId"`
	Status        models.RecipeRunStatus `json:"status"`
	CreatedAt     time.Time              `json:"createdAt"`
	ResultSummary string                 `json:"resultSummary"`
}

// Record handles POST /api/ai-employees/{id}/queue.
func (h *RecipeRuns) Record(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.employees.Get(id); err != nil {
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	var body recordRecipeRunBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.RecipeID == "" {
		writeJSONError(w, http.StatusBadRequest, "recipeId is required")
		return
	}
	run := models.RecipeRun{
		ID:            body.ID,
		AIEmployeeID:  id,
		RecipeID:      body.RecipeID,
		ChannelID:     body.ChannelID,
		ThreadID:      body.ThreadID,
		Status:        body.Status,
		CreatedAt:     body.CreatedAt,
		ResultSummary: body.ResultSummary,
	}
	stored := h.svc.Record(run)
	writeJSON(w, http.StatusCreated, map[string]any{"recipeRun": stored})
}
