package models

import "time"

// EventRSVP is the user's response to a community-event invite.
type EventRSVP string

const (
	EventRSVPAccepted EventRSVP = "accepted"
	EventRSVPDeclined EventRSVP = "declined"
	EventRSVPNone     EventRSVP = "none"
)

// Event is a community / family event surfaced from a chat (PROPOSAL.md
// section 5 — "neighborhood block party" demo). Phase 0 ships the static
// shape; AI-driven RSVP cards land in Phase 2.
type Event struct {
	ID             string    `json:"id"`
	ChannelID      string    `json:"channelId"`
	SourceMessageID string   `json:"sourceMessageId,omitempty"`
	Title          string    `json:"title"`
	StartsAt       time.Time `json:"startsAt"`
	Location       string    `json:"location,omitempty"`
	RSVP           EventRSVP `json:"rsvp"`
	AttendeeCount  int       `json:"attendeeCount"`
	AIGenerated    bool      `json:"aiGenerated"`
}
