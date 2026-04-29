package models

// FormStatus tracks lifecycle of an intake Form (vendor onboarding,
// expense report, access request).
type FormStatus string

const (
	FormStatusDraft     FormStatus = "draft"
	FormStatusSubmitted FormStatus = "submitted"
)

// FormFieldDef describes a single labelled field on a form template so the
// renderer can display the form even when the AI did not prefill a value.
type FormFieldDef struct {
	Name     string `json:"name"`
	Label    string `json:"label"`
	Required bool   `json:"required,omitempty"`
}

// FormTemplate is a reusable definition (vendor onboarding, expense report,
// access request). Templates are seeded by the backend; the renderer picks
// one and the AI prefills the values from a thread (PROPOSAL.md §5.4 Forms
// intake).
type FormTemplate struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Fields []FormFieldDef `json:"fields"`
}

// Form is the Forms KApp object — a structured intake instance derived from
// a thread. ARCHITECTURE.md §6.1 KApps object model.
type Form struct {
	ID             string            `json:"id"`
	ChannelID      string            `json:"channelId"`
	TemplateID     string            `json:"templateId"`
	Title          string            `json:"title"`
	Fields         map[string]string `json:"fields"`
	SourceThreadID string            `json:"sourceThreadId,omitempty"`
	Status         FormStatus        `json:"status"`
	AIGenerated    bool              `json:"aiGenerated"`
}
