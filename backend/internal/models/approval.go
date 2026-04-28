package models

import "time"

// ApprovalStatus is the current decision state of an Approval KApp.
type ApprovalStatus string

const (
	ApprovalStatusPending  ApprovalStatus = "pending"
	ApprovalStatusApproved ApprovalStatus = "approved"
	ApprovalStatusRejected ApprovalStatus = "rejected"
)

// ApprovalDecision is the action recorded in the immutable decision log when
// an approver approves, rejects, or comments.
type ApprovalDecision string

const (
	ApprovalDecisionApprove ApprovalDecision = "approve"
	ApprovalDecisionReject  ApprovalDecision = "reject"
	ApprovalDecisionComment ApprovalDecision = "comment"
)

// ApprovalDecisionEntry is a single entry in the immutable decision log.
type ApprovalDecisionEntry struct {
	At       time.Time        `json:"at"`
	Actor    string           `json:"actor"`
	Decision ApprovalDecision `json:"decision"`
	Note     string           `json:"note,omitempty"`
}

// ApprovalFields is the prefilled / human-edited body of the approval card.
// The named fields cover the demo's vendor-approval flow (PROPOSAL.md 5.3);
// Extra carries any additional template-specific fields.
type ApprovalFields struct {
	Vendor        string            `json:"vendor,omitempty"`
	Amount        string            `json:"amount,omitempty"`
	Justification string            `json:"justification,omitempty"`
	Risk          string            `json:"risk,omitempty"`
	Extra         map[string]string `json:"extra,omitempty"`
}

// Approval is the Approvals KApp object from ARCHITECTURE.md section 6.1.
type Approval struct {
	ID             string                  `json:"id"`
	ChannelID      string                  `json:"channelId"`
	TemplateID     string                  `json:"templateId"`
	Title          string                  `json:"title"`
	Requester      string                  `json:"requester"`
	Approvers      []string                `json:"approvers"`
	Fields         ApprovalFields          `json:"fields"`
	Status         ApprovalStatus          `json:"status"`
	DecisionLog    []ApprovalDecisionEntry `json:"decisionLog"`
	SourceThreadID string                  `json:"sourceThreadId,omitempty"`
	AIGenerated    bool                    `json:"aiGenerated"`
}
