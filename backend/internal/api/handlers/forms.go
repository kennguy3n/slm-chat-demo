package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Forms hosts the Phase 3 Forms intake endpoints. Templates are seeded
// statically so the renderer always has a layout, even when the AI did
// not prefill values.
type Forms struct {
	kapps *services.KApps
}

func NewForms(k *services.KApps) *Forms { return &Forms{kapps: k} }

type createFormBody struct {
	ChannelID      string            `json:"channelId"`
	TemplateID     string            `json:"templateId"`
	Title          string            `json:"title,omitempty"`
	Fields         map[string]string `json:"fields,omitempty"`
	SourceThreadID string            `json:"sourceThreadId,omitempty"`
	Status         string            `json:"status,omitempty"`
	AIGenerated    bool              `json:"aiGenerated,omitempty"`
}

// Create handles POST /api/kapps/forms.
func (h *Forms) Create(w http.ResponseWriter, r *http.Request) {
	var body createFormBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	form, err := h.kapps.CreateForm(services.CreateFormInput{
		ChannelID:      body.ChannelID,
		TemplateID:     body.TemplateID,
		Title:          body.Title,
		Fields:         body.Fields,
		SourceThreadID: body.SourceThreadID,
		Status:         models.FormStatus(body.Status),
		AIGenerated:    body.AIGenerated,
	})
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"form": form})
}

// List handles GET /api/kapps/forms?channelId=...
func (h *Forms) List(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	forms := h.kapps.ListForms(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"forms": forms})
}

// Templates handles GET /api/kapps/form-templates.
func (h *Forms) Templates(w http.ResponseWriter, r *http.Request) {
	tmpls := h.kapps.ListFormTemplates()
	writeJSON(w, http.StatusOK, map[string]any{"templates": tmpls})
}
