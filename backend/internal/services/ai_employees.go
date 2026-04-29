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
