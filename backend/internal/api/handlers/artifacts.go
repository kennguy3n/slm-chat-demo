package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Artifacts hosts the Phase 3 Docs/Artifacts KApp endpoints — create,
// list, fetch, patch, plus per-version create / fetch. Real CRUD lives
// here; AI drafting still runs in the Electron main process and the
// renderer hands the streamed body to POST /api/kapps/artifacts to
// persist it.
type Artifacts struct {
	kapps *services.KApps
}

func NewArtifacts(k *services.KApps) *Artifacts { return &Artifacts{kapps: k} }

type createArtifactBody struct {
	ChannelID      string                      `json:"channelId"`
	Type           string                      `json:"type"`
	Title          string                      `json:"title"`
	TemplateID     string                      `json:"templateId,omitempty"`
	SourceThreadID string                      `json:"sourceThreadId,omitempty"`
	Author         string                      `json:"author,omitempty"`
	Summary        string                      `json:"summary,omitempty"`
	Body           string                      `json:"body,omitempty"`
	SourcePins     []models.ArtifactSourcePin  `json:"sourcePins,omitempty"`
	AIGenerated    bool                        `json:"aiGenerated,omitempty"`
}

// Create handles POST /api/kapps/artifacts.
func (h *Artifacts) Create(w http.ResponseWriter, r *http.Request) {
	var body createArtifactBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	in := services.CreateArtifactInput{
		ChannelID:      body.ChannelID,
		Type:           models.ArtifactType(body.Type),
		Title:          body.Title,
		TemplateID:     body.TemplateID,
		SourceThreadID: body.SourceThreadID,
		Author:         body.Author,
		Body:           body.Body,
		Summary:        body.Summary,
		SourcePins:     body.SourcePins,
		AIGenerated:    body.AIGenerated,
		Actor:          actorFromContext(r),
	}
	a, err := h.kapps.CreateArtifact(in)
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"artifact": a})
}

// List handles GET /api/kapps/artifacts?channelId=...
func (h *Artifacts) List(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	artifacts := h.kapps.ListArtifacts(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"artifacts": artifacts})
}

// Get handles GET /api/kapps/artifacts/{id}.
func (h *Artifacts) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	a, err := h.kapps.GetArtifact(id)
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"artifact": a})
}

type updateArtifactBody struct {
	Title  *string `json:"title,omitempty"`
	Status *string `json:"status,omitempty"`
	URL    *string `json:"url,omitempty"`
}

// Update handles PATCH /api/kapps/artifacts/{id}.
func (h *Artifacts) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body updateArtifactBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	var statusPtr *models.ArtifactStatus
	if body.Status != nil {
		s := models.ArtifactStatus(*body.Status)
		statusPtr = &s
	}
	a, err := h.kapps.UpdateArtifact(id, services.UpdateArtifactInput{
		Title:  body.Title,
		Status: statusPtr,
		URL:    body.URL,
		Actor:  actorFromContext(r),
	})
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"artifact": a})
}

type createVersionBody struct {
	Author     string                     `json:"author,omitempty"`
	Summary    string                     `json:"summary,omitempty"`
	Body       string                     `json:"body"`
	SourcePins []models.ArtifactSourcePin `json:"sourcePins,omitempty"`
}

// CreateVersion handles POST /api/kapps/artifacts/{id}/versions.
func (h *Artifacts) CreateVersion(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body createVersionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	v, err := h.kapps.CreateArtifactVersion(id, services.CreateArtifactVersionInput{
		Author:     body.Author,
		Summary:    body.Summary,
		Body:       body.Body,
		SourcePins: body.SourcePins,
		Actor:      actorFromContext(r),
	})
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"version": v})
}

// GetVersion handles GET /api/kapps/artifacts/{id}/versions/{version}.
func (h *Artifacts) GetVersion(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	versionStr := chi.URLParam(r, "version")
	version, err := strconv.Atoi(versionStr)
	if err != nil || version <= 0 {
		writeJSONError(w, http.StatusBadRequest, "version must be a positive integer")
		return
	}
	v, err := h.kapps.GetArtifactVersion(id, version)
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"version": v})
}
