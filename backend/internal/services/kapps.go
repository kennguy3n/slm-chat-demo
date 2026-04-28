package services

import (
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// KApps exposes KApp object lookups (tasks, approvals, artifacts, events) for
// the API handlers. Phase 0 only surfaces seeded cards; create/update flows
// land in Phase 3.
type KApps struct {
	store *store.Memory
}

func NewKApps(s *store.Memory) *KApps { return &KApps{store: s} }

// Cards returns every seeded KApp card. Callers may filter by channel ID; an
// empty channelID returns the full list.
func (k *KApps) Cards(channelID string) []models.Card {
	all := k.store.ListCards()
	if channelID == "" {
		return all
	}
	out := make([]models.Card, 0, len(all))
	for _, c := range all {
		if cardChannelID(c) == channelID {
			out = append(out, c)
		}
	}
	return out
}

func cardChannelID(c models.Card) string {
	switch c.Kind {
	case models.CardKindTask:
		if c.Task != nil {
			return c.Task.ChannelID
		}
	case models.CardKindApproval:
		if c.Approval != nil {
			return c.Approval.ChannelID
		}
	case models.CardKindArtifact:
		if c.Artifact != nil {
			return c.Artifact.ChannelID
		}
	case models.CardKindEvent:
		if c.Event != nil {
			return c.Event.ChannelID
		}
	}
	return ""
}
