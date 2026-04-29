package services

import (
	"errors"
	"fmt"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// ErrUnknownChannel is returned when an AI Employee channel update
// references a channel that doesn't exist in the store. Handlers map
// this to HTTP 400.
var ErrUnknownChannel = errors.New("ai_employees: unknown channel")

// ErrBudgetExceeded is returned by IncrementUsage when applying the
// requested token increment would push the employee over
// `MaxTokensPerDay`. Handlers map this to HTTP 429. Recipe dispatchers
// treat it as a soft refusal (the recipe should not run) rather than
// a hard server error.
var ErrBudgetExceeded = errors.New("ai_employees: budget exceeded")

// ErrInvalidBudget is returned when a caller attempts to set a
// negative `MaxTokensPerDay` or pass a negative token-usage
// increment. Mapped to HTTP 400.
var ErrInvalidBudget = errors.New("ai_employees: invalid budget")

// AIEmployeeService exposes the Phase 4 AI Employee endpoints. It is
// backed by the in-memory store; callers should treat it as
// workspace-scoped metadata (same lifetime as users / channels).
type AIEmployeeService struct {
	store *store.Memory
}

// NewAIEmployeeService constructs the service.
func NewAIEmployeeService(s *store.Memory) *AIEmployeeService {
	return &AIEmployeeService{store: s}
}

// List returns every seeded AI Employee.
func (s *AIEmployeeService) List() []models.AIEmployee {
	return s.store.ListAIEmployees()
}

// Get returns a single AI Employee by ID. Returns ErrNotFound when the
// employee does not exist.
func (s *AIEmployeeService) Get(id string) (models.AIEmployee, error) {
	e, ok := s.store.GetAIEmployee(id)
	if !ok {
		return models.AIEmployee{}, ErrNotFound
	}
	return e, nil
}

// UpdateAllowedChannels replaces the allowed-channel list for the AI
// Employee. Every supplied channel ID must already exist in the store;
// unknown IDs return ErrUnknownChannel.
func (s *AIEmployeeService) UpdateAllowedChannels(id string, channelIDs []string) (models.AIEmployee, error) {
	for _, cid := range channelIDs {
		if _, ok := s.store.GetChannel(cid); !ok {
			return models.AIEmployee{}, fmt.Errorf("%w: %s", ErrUnknownChannel, cid)
		}
	}
	cleaned := make([]string, 0, len(channelIDs))
	for _, cid := range channelIDs {
		cleaned = append(cleaned, cid)
	}
	updated, ok := s.store.UpdateAIEmployee(id, func(e *models.AIEmployee) {
		e.AllowedChannelIDs = cleaned
	})
	if !ok {
		return models.AIEmployee{}, ErrNotFound
	}
	return updated, nil
}

// UpdateRecipes replaces the recipe list for the AI Employee. Recipe
// IDs are opaque strings — validation happens at the recipe-registry
// layer in the Electron main process, so the backend accepts any
// non-empty list of string IDs.
func (s *AIEmployeeService) UpdateRecipes(id string, recipeIDs []string) (models.AIEmployee, error) {
	cleaned := make([]string, 0, len(recipeIDs))
	for _, rid := range recipeIDs {
		cleaned = append(cleaned, rid)
	}
	updated, ok := s.store.UpdateAIEmployee(id, func(e *models.AIEmployee) {
		e.Recipes = cleaned
	})
	if !ok {
		return models.AIEmployee{}, ErrNotFound
	}
	return updated, nil
}

// UpdateBudget sets the per-day token ceiling for the AI Employee.
// `maxTokensPerDay` must be non-negative; 0 is interpreted as
// "display-only" (no enforcement — kept for parity with the seeded
// default). The `UsedTokensToday` counter is preserved.
func (s *AIEmployeeService) UpdateBudget(id string, maxTokensPerDay int) (models.AIEmployee, error) {
	if maxTokensPerDay < 0 {
		return models.AIEmployee{}, fmt.Errorf("%w: maxTokensPerDay must be >= 0", ErrInvalidBudget)
	}
	updated, ok := s.store.UpdateAIEmployee(id, func(e *models.AIEmployee) {
		e.Budget.MaxTokensPerDay = maxTokensPerDay
	})
	if !ok {
		return models.AIEmployee{}, ErrNotFound
	}
	return updated, nil
}

// IncrementUsage atomically bumps `UsedTokensToday` for the employee.
// Returns ErrBudgetExceeded (mapped to HTTP 429) when the increment
// would push usage past `MaxTokensPerDay`. A `MaxTokensPerDay` of 0
// disables enforcement — the counter still tracks usage but never
// refuses. Negative token counts are rejected with ErrInvalidBudget.
func (s *AIEmployeeService) IncrementUsage(id string, tokensUsed int) (models.AIEmployee, error) {
	if tokensUsed < 0 {
		return models.AIEmployee{}, fmt.Errorf("%w: tokensUsed must be >= 0", ErrInvalidBudget)
	}
	var exceeded bool
	updated, ok := s.store.UpdateAIEmployee(id, func(e *models.AIEmployee) {
		if e.Budget.MaxTokensPerDay > 0 &&
			e.Budget.UsedTokensToday+tokensUsed > e.Budget.MaxTokensPerDay {
			exceeded = true
			return
		}
		e.Budget.UsedTokensToday += tokensUsed
	})
	if !ok {
		return models.AIEmployee{}, ErrNotFound
	}
	if exceeded {
		return updated, ErrBudgetExceeded
	}
	return updated, nil
}

// ResetDailyUsage zeroes `UsedTokensToday` for every AI Employee.
// Intended to be called by a scheduled job at local midnight; also
// useful for the demo's "reset" button in tests.
func (s *AIEmployeeService) ResetDailyUsage() {
	for _, e := range s.store.ListAIEmployees() {
		s.store.UpdateAIEmployee(e.ID, func(empl *models.AIEmployee) {
			empl.Budget.UsedTokensToday = 0
		})
	}
}
