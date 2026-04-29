package store

import (
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// Seed populates the store with the Phase 0 demo data: five mock users, a
// personal B2C workspace, an "Acme Corp" B2B workspace with two domains, the
// channels they contain, and realistic chat messages that back the demo flows
// described in PROPOSAL.md section 5.
func Seed(m *Memory) {
	now := time.Date(2026, 4, 28, 9, 0, 0, 0, time.UTC)

	// Users.
	users := []models.User{
		{ID: "user_alice", DisplayName: "Alice Chen", Email: "alice@example.com", AvatarColor: "#7c3aed"},
		{ID: "user_bob", DisplayName: "Bob Martinez", Email: "bob@example.com", AvatarColor: "#0ea5e9"},
		{ID: "user_carol", DisplayName: "Carol Kim", Email: "carol@example.com", AvatarColor: "#16a34a"},
		{ID: "user_dave", DisplayName: "Dave Wilson", Email: "dave@example.com", AvatarColor: "#f97316"},
		{ID: "user_eve", DisplayName: "Eve Johnson", Email: "eve@example.com", AvatarColor: "#dc2626"},
	}
	for _, u := range users {
		m.PutUser(u)
	}

	// Workspaces.
	personal := models.Workspace{
		ID:      "ws_personal",
		Name:    "Personal",
		Context: models.ContextB2C,
		Domains: []models.Domain{
			{ID: "dom_personal", Name: "Personal", WorkspaceID: "ws_personal"},
		},
	}
	acme := models.Workspace{
		ID:      "ws_acme",
		Name:    "Acme Corp",
		Context: models.ContextB2B,
		Domains: []models.Domain{
			{ID: "dom_eng", Name: "Engineering", WorkspaceID: "ws_acme"},
			{ID: "dom_fin", Name: "Finance", WorkspaceID: "ws_acme"},
		},
	}
	m.PutWorkspace(personal)
	m.PutWorkspace(acme)

	// Channels — B2C.
	channels := []models.Channel{
		{
			ID:          "ch_dm_alice_bob",
			WorkspaceID: personal.ID,
			DomainID:    "dom_personal",
			Name:        "Bob Martinez",
			Kind:        models.ChannelDM,
			Context:     models.ContextB2C,
			MemberIDs:   []string{"user_alice", "user_bob"},
		},
		{
			ID:          "ch_family",
			WorkspaceID: personal.ID,
			DomainID:    "dom_personal",
			Name:        "Family Group",
			Kind:        models.ChannelFamily,
			Context:     models.ContextB2C,
			MemberIDs:   []string{"user_alice", "user_bob"},
		},
		{
			ID:          "ch_neighborhood",
			WorkspaceID: personal.ID,
			DomainID:    "dom_personal",
			Name:        "Neighborhood Community",
			Kind:        models.ChannelCommunity,
			Context:     models.ContextB2C,
			MemberIDs:   []string{"user_alice", "user_carol"},
		},

		// Channels — B2B.
		{
			ID:          "ch_general",
			WorkspaceID: acme.ID,
			DomainID:    "dom_eng",
			Name:        "general",
			Kind:        models.ChannelChannel,
			Context:     models.ContextB2B,
			MemberIDs:   []string{"user_alice", "user_dave", "user_eve"},
		},
		{
			ID:          "ch_engineering",
			WorkspaceID: acme.ID,
			DomainID:    "dom_eng",
			Name:        "engineering",
			Kind:        models.ChannelChannel,
			Context:     models.ContextB2B,
			MemberIDs:   []string{"user_alice", "user_dave", "user_eve"},
		},
		{
			ID:          "ch_vendor_management",
			WorkspaceID: acme.ID,
			DomainID:    "dom_fin",
			Name:        "vendor-management",
			Kind:        models.ChannelChannel,
			Context:     models.ContextB2B,
			MemberIDs:   []string{"user_alice", "user_dave", "user_eve"},
		},
	}
	for _, c := range channels {
		m.PutChannel(c)
	}

	// Messages.
	seedMessages(m, now)

	// KApp cards (Phase 0 demo dataset for GET /api/kapps/cards).
	seedCards(m, now)

	// Phase 3 — seeded form templates that back the Forms intake KApp.
	seedFormTemplates(m)
}

// seedFormTemplates loads the three intake templates surfaced by the demo
// (vendor onboarding, expense report, access request). The renderer uses
// these definitions to lay out the FormCard even when the AI has not yet
// prefilled values.
func seedFormTemplates(m *Memory) {
	m.PutFormTemplate(models.FormTemplate{
		ID:    "vendor_onboarding_v1",
		Title: "Vendor onboarding",
		Fields: []models.FormFieldDef{
			{Name: "vendor", Label: "Vendor name", Required: true},
			{Name: "contact", Label: "Primary contact"},
			{Name: "service", Label: "Service / product"},
			{Name: "amount", Label: "Estimated annual spend"},
			{Name: "compliance", Label: "Compliance notes"},
		},
	})
	m.PutFormTemplate(models.FormTemplate{
		ID:    "expense_report_v1",
		Title: "Expense report",
		Fields: []models.FormFieldDef{
			{Name: "category", Label: "Category", Required: true},
			{Name: "amount", Label: "Amount", Required: true},
			{Name: "vendor", Label: "Vendor / merchant"},
			{Name: "justification", Label: "Justification"},
			{Name: "date", Label: "Date"},
		},
	})
	m.PutFormTemplate(models.FormTemplate{
		ID:    "access_request_v1",
		Title: "Access request",
		Fields: []models.FormFieldDef{
			{Name: "system", Label: "System", Required: true},
			{Name: "role", Label: "Role / permission"},
			{Name: "justification", Label: "Justification"},
			{Name: "duration", Label: "Duration"},
		},
	})
}

func seedMessages(m *Memory, base time.Time) {
	// B2C — Alice <-> Bob DM.
	addMsg(m, "msg_dm_1", "ch_dm_alice_bob", "", "user_bob", "hey, are you free for dinner Thursday?", base.Add(-3*time.Hour))
	addMsg(m, "msg_dm_2", "ch_dm_alice_bob", "", "user_alice", "yes! 7pm at the usual place?", base.Add(-3*time.Hour+5*time.Minute))
	addMsg(m, "msg_dm_3", "ch_dm_alice_bob", "", "user_bob", "perfect, I'll book it", base.Add(-3*time.Hour+6*time.Minute))

	// B2C — Family group (drives the task-extraction demo flow in PROPOSAL 5.2).
	addMsg(m, "msg_fam_1", "ch_family", "", "user_bob", "Mom: Field trip form due Friday, please sign. Also we need sunscreen.", base.Add(-2*time.Hour))
	addMsg(m, "msg_fam_2", "ch_family", "", "user_alice", "got it — I'll sign the form tonight and grab sunscreen on the way home", base.Add(-2*time.Hour+10*time.Minute))
	addMsg(m, "msg_fam_3", "ch_family", "", "user_bob", "thanks!", base.Add(-2*time.Hour+11*time.Minute))

	// B2C — Neighborhood community (event card demo).
	addMsg(m, "msg_comm_1", "ch_neighborhood", "", "user_carol", "Block party Saturday May 16, 4pm at Maple Park. Bring a side dish!", base.Add(-90*time.Minute))
	addMsg(m, "msg_comm_2", "ch_neighborhood", "", "user_alice", "in! happy to bring drinks", base.Add(-85*time.Minute))
	addMsg(m, "msg_comm_3", "ch_neighborhood", "", "user_carol", "rain plan: we'll move to the community center if it's wet", base.Add(-80*time.Minute))

	// B2B — vendor-management thread (vendor approval demo flow, PROPOSAL 5.3).
	addMsg(m, "msg_vend_root", "ch_vendor_management", "msg_vend_root", "user_dave", "Need to lock vendor pricing for the Q3 logging contract — three bids on the table.", base.Add(-50*time.Minute))
	addMsg(m, "msg_vend_r1", "ch_vendor_management", "msg_vend_root", "user_eve", "what are the bids and risk notes?", base.Add(-48*time.Minute))
	addMsg(m, "msg_vend_r2", "ch_vendor_management", "msg_vend_root", "user_dave", "Acme Logs $42k/yr, BetterLog $51k/yr, CloudTrace $39k/yr. CloudTrace failed our SOC 2 review last quarter.", base.Add(-45*time.Minute))
	addMsg(m, "msg_vend_r3", "ch_vendor_management", "msg_vend_root", "user_eve", "skip CloudTrace then. lean Acme; need pricing breakdown + termination terms before I approve.", base.Add(-43*time.Minute))
	addMsg(m, "msg_vend_r4", "ch_vendor_management", "msg_vend_root", "user_dave", "pulling that now — pending decision in this thread.", base.Add(-42*time.Minute))

	// B2B — engineering thread (PRD draft demo flow, PROPOSAL 5.4).
	addMsg(m, "msg_eng_root", "ch_engineering", "msg_eng_root", "user_alice", "Kicking off the inline-translation feature. Goal: per-message translation rendered under the bubble, original always one tap away.", base.Add(-30*time.Minute))
	addMsg(m, "msg_eng_r1", "ch_engineering", "msg_eng_root", "user_dave", "requirements I have so far: locale auto-detect, on-device only, fall back to original on low confidence, must work in family group chats.", base.Add(-28*time.Minute))
	addMsg(m, "msg_eng_r2", "ch_engineering", "msg_eng_root", "user_eve", "metric: % messages translated successfully without user toggling back to original. target > 90% for top 5 locales.", base.Add(-25*time.Minute))
	addMsg(m, "msg_eng_r3", "ch_engineering", "msg_eng_root", "user_alice", "good. I'll draft a PRD from this thread and post v1 here for review.", base.Add(-23*time.Minute))

	// B2B — #general (a couple of casual messages so the channel is not empty).
	addMsg(m, "msg_gen_1", "ch_general", "", "user_eve", "morning everyone — standup in 10", base.Add(-20*time.Minute))
	addMsg(m, "msg_gen_2", "ch_general", "", "user_dave", "joining", base.Add(-19*time.Minute))
}

// seedCards loads four sample KApp cards covering each card kind so the
// frontend's KAppCardRenderer demo has realistic data:
//
//   - a Task extracted from the family-group "field trip / sunscreen"
//     message (PROPOSAL.md 5.2);
//   - an Approval drafted from the vendor-management thread (PROPOSAL.md 5.3);
//   - an Artifact drafted from the engineering inline-translation thread
//     (PROPOSAL.md 5.4);
//   - an Event from the neighborhood block-party message.
func seedCards(m *Memory, base time.Time) {
	dueFriday := base.Add(72 * time.Hour)
	startsSat := time.Date(2026, 5, 16, 16, 0, 0, 0, time.UTC)

	m.PutCard(models.Card{
		Kind:     models.CardKindTask,
		ThreadID: "msg_fam_1",
		Task: &models.Task{
			ID:              "task_sunscreen",
			ChannelID:       "ch_family",
			SourceThreadID:  "msg_fam_1",
			SourceMessageID: "msg_fam_1",
			Title:           "Buy sunscreen for field trip",
			Owner:           "user_alice",
			DueDate:         &dueFriday,
			Status:          models.TaskStatusOpen,
			AIGenerated:     true,
			History: []models.TaskHistoryEntry{
				{
					At:     base.Add(-2 * time.Hour).Add(2 * time.Minute),
					Actor:  "ai",
					Action: "extracted",
					Note:   "extracted from message msg_fam_1",
				},
			},
		},
	})

	m.PutCard(models.Card{
		Kind:     models.CardKindApproval,
		ThreadID: "msg_vend_root",
		Approval: &models.Approval{
			ID:             "appr_vendor_q3_logging",
			ChannelID:      "ch_vendor_management",
			TemplateID:     "vendor_contract_v1",
			Title:          "Q3 logging vendor contract",
			Requester:      "user_dave",
			Approvers:      []string{"user_eve"},
			Fields: models.ApprovalFields{
				Vendor:        "Acme Logs",
				Amount:        "$42,000 / yr",
				Justification: "Lowest-cost SOC 2-cleared bidder; CloudTrace failed last quarter's review.",
				Risk:          "medium",
			},
			Status:         models.ApprovalStatusPending,
			DecisionLog:    []models.ApprovalDecisionEntry{},
			SourceThreadID: "msg_vend_root",
			AIGenerated:    true,
		},
	})

	m.PutCard(models.Card{
		Kind:     models.CardKindArtifact,
		ThreadID: "msg_eng_root",
		Artifact: &models.Artifact{
			ID:        "art_inline_translation_prd",
			ChannelID: "ch_engineering",
			Type:      models.ArtifactTypePRD,
			Title:     "Inline translation PRD",
			TemplateID: "prd_v1",
			SourceRefs: []models.ArtifactSourceRef{
				{Kind: "thread", ID: "msg_eng_root", Note: "Engineering kickoff thread"},
			},
			Versions: []models.ArtifactVersion{
				{
					Version:   1,
					CreatedAt: base.Add(-22 * time.Minute),
					Author:    "user_alice",
					Summary:   "Initial draft from engineering thread",
					Body: "# Goal\n" +
						"Render per-message inline translation under each chat bubble.\n\n" +
						"# Requirements\n" +
						"- Locale auto-detect; fall back to original on low confidence.\n" +
						"- On-device only.\n\n" +
						"# Metrics\n" +
						"- > 90% of messages translated successfully without user toggle, top 5 locales.\n",
					SourcePins: []models.ArtifactSourcePin{
						{
							SectionID:       "goal",
							SourceMessageID: "msg_eng_root",
							SourceThreadID:  "msg_eng_root",
							Sender:          "user_alice",
							Excerpt:         "Kicking off the inline-translation feature.",
						},
						{
							SectionID:       "requirements",
							SourceMessageID: "msg_eng_r1",
							SourceThreadID:  "msg_eng_root",
							Sender:          "user_dave",
							Excerpt:         "locale auto-detect, on-device only, fall back to original on low confidence",
						},
						{
							SectionID:       "metrics",
							SourceMessageID: "msg_eng_r2",
							SourceThreadID:  "msg_eng_root",
							Sender:          "user_eve",
							Excerpt:         "metric: % messages translated successfully ... target > 90% for top 5 locales",
						},
					},
				},
			},
			Status:      models.ArtifactStatusDraft,
			AIGenerated: true,
			URL:         "/artifacts/art_inline_translation_prd",
		},
	})

	m.PutCard(models.Card{
		Kind: models.CardKindEvent,
		Event: &models.Event{
			ID:              "evt_block_party",
			ChannelID:       "ch_neighborhood",
			SourceMessageID: "msg_comm_1",
			Title:           "Neighborhood block party",
			StartsAt:        startsSat,
			Location:        "Maple Park",
			RSVP:            models.EventRSVPAccepted,
			AttendeeCount:   12,
			AIGenerated:     true,
		},
	})
}

func addMsg(m *Memory, id, channelID, threadID, senderID, content string, t time.Time) {
	m.PutMessage(models.Message{
		ID:        id,
		ChannelID: channelID,
		ThreadID:  threadID,
		SenderID:  senderID,
		Content:   content,
		CreatedAt: t,
	})
}
