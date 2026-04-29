package handlers

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Encryption is the HTTP surface for per-tenant encryption keys.
//
//   - GET   /api/workspaces/{id}/encryption-keys           — list keys
//   - POST  /api/workspaces/{id}/encryption-keys           — generate
//   - POST  /api/workspaces/{id}/encryption-keys/rotate    — rotate
type Encryption struct {
	keys *services.EncryptionKeyService
}

func NewEncryption(k *services.EncryptionKeyService) *Encryption {
	return &Encryption{keys: k}
}

func (h *Encryption) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	keys := h.keys.ListKeys(wsID)
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys})
}

func (h *Encryption) Generate(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	key, err := h.keys.GenerateKey(wsID)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"key": key})
}

func (h *Encryption) Rotate(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	if _, err := h.keys.GetActiveKey(wsID); err != nil {
		if errors.Is(err, services.ErrNoActiveKey) {
			writeJSONError(w, http.StatusNotFound, "no active key to rotate")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	key, err := h.keys.RotateKey(wsID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key})
}
