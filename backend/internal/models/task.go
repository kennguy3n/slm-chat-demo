package models

import "time"

// TaskStatus represents the lifecycle state of a Task KApp.
type TaskStatus string

const (
	TaskStatusOpen       TaskStatus = "open"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusBlocked    TaskStatus = "blocked"
	TaskStatusDone       TaskStatus = "done"
)

// TaskHistoryEntry records a single state change on a Task. Tasks accrue
// history entries on create, status change, owner change, and edits, giving
// the UI an audit trail per ARCHITECTURE.md section 6.1.
type TaskHistoryEntry struct {
	At     time.Time `json:"at"`
	Actor  string    `json:"actor"`
	Action string    `json:"action"`
	Note   string    `json:"note,omitempty"`
}

// Task is the Tasks KApp object from ARCHITECTURE.md section 6.1. A task
// extracted from chat carries a back-link to its source thread / message and
// the AIGenerated flag so the UI can attach a privacy strip and an "AI"
// badge.
type Task struct {
	ID             string             `json:"id"`
	ChannelID      string             `json:"channelId"`
	SourceThreadID string             `json:"sourceThreadId,omitempty"`
	SourceMessageID string            `json:"sourceMessageId,omitempty"`
	Title          string             `json:"title"`
	Owner          string             `json:"owner,omitempty"`
	DueDate        *time.Time         `json:"dueDate,omitempty"`
	Status         TaskStatus         `json:"status"`
	AIGenerated    bool               `json:"aiGenerated"`
	History        []TaskHistoryEntry `json:"history,omitempty"`
}
