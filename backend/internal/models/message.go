package models

import "time"

// Message is a single chat message inside a channel. A non-empty ThreadID marks
// the message as a reply in a thread; the thread root has ThreadID == ID.
type Message struct {
	ID        string    `json:"id"`
	ChannelID string    `json:"channelId"`
	ThreadID  string    `json:"threadId,omitempty"`
	SenderID  string    `json:"senderId"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}
