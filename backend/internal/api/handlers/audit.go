package handlers

import (
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Audit serves the immutable audit log on GET /api/audit. The Phase 3
// in-memory implementation supports filtering by objectId and
// objectKind; channelId scoping is best-effort (it scans the cards
// store for objects that belong to the channel and unions their
// audit entries). Phase 6+ replaces this with the real audit-service.
type Audit struct {
	audit *services.AuditService
	kapps *services.KApps
}

func NewAudit(a *services.AuditService, k *services.KApps) *Audit {
	return &Audit{audit: a, kapps: k}
}

// List handles GET /api/audit.
//
// Query parameters:
//   - `objectId` (string): filter to entries for one specific object.
//   - `objectKind` (string): one of `task|approval|artifact|form`.
//   - `channelId` (string): union of all entries whose object lives in
//     the channel. Implemented by walking the cards store; a missing or
//     unknown channel returns an empty list.
func (h *Audit) List(w http.ResponseWriter, r *http.Request) {
	objectID := r.URL.Query().Get("objectId")
	objectKind := r.URL.Query().Get("objectKind")
	channelID := r.URL.Query().Get("channelId")

	if channelID != "" {
		// Build the set of object ids that belong to this channel by
		// walking the cards we already have (tasks / approvals /
		// artifacts / forms). Audit entries are then filtered to that
		// id set. This keeps the in-memory implementation simple
		// without storing channel ids on every audit row.
		ids := h.objectIDsForChannel(channelID)
		all := h.audit.List("", objectKind)
		entries := make([]models.AuditEntry, 0, len(all))
		for _, e := range all {
			if _, ok := ids[e.ObjectID]; ok {
				entries = append(entries, e)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
		return
	}

	entries := h.audit.List(objectID, objectKind)
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func (h *Audit) objectIDsForChannel(channelID string) map[string]struct{} {
	ids := map[string]struct{}{}
	for _, c := range h.kapps.Cards(channelID) {
		switch c.Kind {
		case models.CardKindTask:
			if c.Task != nil {
				ids[c.Task.ID] = struct{}{}
			}
		case models.CardKindApproval:
			if c.Approval != nil {
				ids[c.Approval.ID] = struct{}{}
			}
		case models.CardKindArtifact:
			if c.Artifact != nil {
				ids[c.Artifact.ID] = struct{}{}
			}
		}
	}
	for _, f := range h.kapps.ListForms(channelID) {
		ids[f.ID] = struct{}{}
	}
	return ids
}
