package services

import (
	"fmt"
	"sync/atomic"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// RecipeRunService is the Phase 4 queue-view backend. It owns the
// lightweight in-memory log of recipe runs the renderer records when an
// AI Employee kicks a recipe off, and exposes completion hooks for the
// renderer to close out runs once the recipe finishes.
type RecipeRunService struct {
	store *store.Memory
	seq   atomic.Uint64
	now   func() time.Time
}

// NewRecipeRunService constructs the service using the wall clock.
func NewRecipeRunService(s *store.Memory) *RecipeRunService {
	return &RecipeRunService{store: s, now: time.Now}
}

// WithClock overrides the clock used for CreatedAt / CompletedAt
// timestamps. Tests use this to pin deterministic timestamps.
func (s *RecipeRunService) WithClock(now func() time.Time) *RecipeRunService {
	s.now = now
	return s
}

// List returns the queued / completed recipe runs for an AI Employee.
// Passing an empty aiEmployeeID returns every run in the store.
func (s *RecipeRunService) List(aiEmployeeID string) []models.RecipeRun {
	return s.store.ListRecipeRuns(aiEmployeeID)
}

// Record inserts a new recipe run. A run is typically recorded as
// "pending" or "running"; the service fills in an ID + CreatedAt if
// the caller left them blank so callers don't need a UUID library.
func (s *RecipeRunService) Record(run models.RecipeRun) models.RecipeRun {
	if run.ID == "" {
		n := s.seq.Add(1)
		run.ID = fmt.Sprintf("rr_%d_%d", s.now().UnixNano(), n)
	}
	if run.CreatedAt.IsZero() {
		run.CreatedAt = s.now()
	}
	if run.Status == "" {
		run.Status = models.RecipeRunStatusPending
	}
	s.store.AppendRecipeRun(run)
	return run
}

// Complete marks the recipe run as completed with a human-facing
// summary. Returns ErrNotFound if no run exists with the given ID.
func (s *RecipeRunService) Complete(id string, summary string) (models.RecipeRun, error) {
	t := s.now()
	updated, ok := s.store.UpdateRecipeRun(id, func(r *models.RecipeRun) {
		r.Status = models.RecipeRunStatusCompleted
		r.ResultSummary = summary
		r.CompletedAt = &t
	})
	if !ok {
		return models.RecipeRun{}, ErrNotFound
	}
	return updated, nil
}
