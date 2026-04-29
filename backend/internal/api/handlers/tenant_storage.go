package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// TenantStorage is the HTTP surface for per-tenant storage configuration:
//
//   - GET    /api/workspaces/{id}/storage
//   - PATCH  /api/workspaces/{id}/storage
type TenantStorage struct {
	svc *services.TenantStorageService
}

func NewTenantStorage(s *services.TenantStorageService) *TenantStorage {
	return &TenantStorage{svc: s}
}

func (h *TenantStorage) Get(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	cfg, err := h.svc.Get(wsID)
	if err != nil {
		if errors.Is(err, services.ErrTenantStorageNotFound) {
			writeJSONError(w, http.StatusNotFound, "tenant storage config not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"storage": cfg})
}

func (h *TenantStorage) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	var patch services.TenantStoragePatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	cfg, err := h.svc.Update(wsID, patch)
	if err != nil {
		if errors.Is(err, services.ErrTenantStorageNotFound) {
			writeJSONError(w, http.StatusNotFound, "tenant storage config not found")
			return
		}
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"storage": cfg})
}
