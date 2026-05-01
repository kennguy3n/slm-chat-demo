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
		{ID: "user_alice", DisplayName: "Alice Chen", Email: "alice@example.com", AvatarColor: "#7c3aed", Active: true},
		{ID: "user_bob", DisplayName: "Bob Martinez", Email: "bob@example.com", AvatarColor: "#0ea5e9", Active: true},
		{ID: "user_carol", DisplayName: "Carol Kim", Email: "carol@example.com", AvatarColor: "#16a34a", Active: true},
		{ID: "user_dave", DisplayName: "Dave Wilson", Email: "dave@example.com", AvatarColor: "#f97316", Active: true},
		{ID: "user_eve", DisplayName: "Eve Johnson", Email: "eve@example.com", AvatarColor: "#dc2626", Active: true},
		{ID: "user_minh", DisplayName: "Minh Nguyen", Email: "minh@example.com", AvatarColor: "#e11d48", Active: true},
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
	//
	// The B2C ground-zero LLM redesign (2026-05-01) collapsed the B2C
	// surface to a single channel: the bilingual Alice ↔ Minh DM.
	// Every B2C demo flow (translation, conversation summary, smart
	// reply, task extraction, conversation insights) routes through
	// the on-device LLM rather than mock-seeded outputs, so the
	// previous family / community / Bob channels (which existed only
	// to drive seed-coupled cards) have been removed.
	channels := []models.Channel{
		{
			// Demo channel for the English ↔ Vietnamese bilingual flow.
			// Alice and Minh alternate languages so the Translate
			// affordance has meaningful work to do on every bubble.
			ID:              "ch_dm_alice_minh",
			WorkspaceID:     personal.ID,
			DomainID:        "dom_personal",
			Name:            "Minh Nguyen",
			Kind:            models.ChannelDM,
			Context:         models.ContextB2C,
			MemberIDs:       []string{"user_alice", "user_minh"},
			PartnerLanguage: "vi",
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
		{
			// New cross-functional launch channel added during the
			// B2B real-LLM redesign so Bonsai-1.7B has a multi-topic
			// thread (marketing / eng / sales) to demonstrate
			// summarisation and task extraction over a richer chat.
			ID:          "ch_product_launch",
			WorkspaceID: acme.ID,
			DomainID:    "dom_eng",
			Name:        "product-launch",
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

	// Phase 4 — seeded AI Employee profiles (Kara Ops AI, Nina PM AI,
	// Mika Sales AI). Each employee is scoped to a specific subset of
	// B2B channels and a short recipe list.
	seedAIEmployees(m, now)

	// Phase 5 — one mocked Google Drive connector attached to Acme
	// Corp's vendor-management channel, plus a small library of
	// realistic files the SourcePicker / retrieval index can show.
	seedConnectors(m, now)

	// Phase 6 — confidential server mode + enterprise hardening.
	// Default workspace policy keeps server compute disabled so the
	// out-of-the-box demo never silently routes off-device.
	seedPhase6(m, now)
}

// seedPhase6 wires the default per-workspace policy, SSO config,
// encryption key, and tenant-storage config for `ws_acme`. Each is the
// minimum set of records the Phase 6 admin handlers expect to find on
// boot.
func seedPhase6(m *Memory, now time.Time) {
	m.PutWorkspacePolicy(models.WorkspacePolicy{
		WorkspaceID:          "ws_acme",
		AllowServerCompute:   false,
		ServerAllowedTasks:   []string{"draft_artifact", "prefill_approval"},
		ServerDeniedTasks:    []string{},
		MaxEgressBytesPerDay: 50_000_000,
		RequireRedaction:     true,
		UpdatedAt:            now,
		UpdatedBy:            "user_alice",
	})
	m.PutSSOConfig(models.SSOConfig{
		WorkspaceID:    "ws_acme",
		Enabled:        false,
		Issuer:         "https://sso.acme.example.com",
		ClientID:       "kchat-slm-demo",
		AllowedDomains: []string{"acme.example.com"},
	})
	m.PutEncryptionKey(models.TenantEncryptionKey{
		WorkspaceID: "ws_acme",
		KeyID:       "key_acme_seed",
		Algorithm:   "aes-256-gcm",
		CreatedAt:   now,
		Active:      true,
	})
	m.PutTenantStorageConfig(models.TenantStorageConfig{
		WorkspaceID:     "ws_acme",
		DatabaseRegion:  "us-east-1",
		StorageBucket:   "kchat-slm-demo-acme",
		Dedicated:       false,
		EncryptionKeyID: "key_acme_seed",
		UpdatedAt:       now,
	})
}

// seedConnectors loads the Phase 5 demo connector data: a single
// mocked Google Drive connector for Acme Corp and four files spanning
// the demo's main flows (vendor approval, PRD draft, budget,
// design brief). No real OAuth or API calls — everything is in-memory.
func seedConnectors(m *Memory, now time.Time) {
	m.PutConnector(models.Connector{
		ID:          "conn_gdrive_acme",
		Kind:        models.ConnectorKindGoogleDrive,
		Name:        "Acme Corp Drive",
		WorkspaceID: "ws_acme",
		ChannelIDs:  []string{"ch_vendor_management"},
		Status:      models.ConnectorStatusConnected,
		CreatedAt:   now,
	})
	files := []models.ConnectorFile{
		{
			ID:          "file_acme_q3_prd",
			ConnectorID: "conn_gdrive_acme",
			Name:        "Q3 Logging Platform PRD.gdoc",
			MimeType:    "application/vnd.google-apps.document",
			Size:        12_840,
			Excerpt:     "Q3 logging platform PRD — replace the legacy syslog ingest with a managed observability vendor. Goals: 99.9% delivery, 30-day retention, SOC 2 Type II vendor, < $45k/yr. Out of scope: client-side telemetry rewrites.",
			URL:         "https://drive.google.com/file/d/file_acme_q3_prd/view",
			Permissions: []string{"alice@acme.com:owner", "dave@acme.com:editor", "eve@acme.com:viewer"},
			ACL:         []string{"user_alice", "user_bob", "user_dave"},
		},
		{
			ID:          "file_acme_vendor_contract",
			ConnectorID: "conn_gdrive_acme",
			Name:        "Acme Logs Vendor Contract.pdf",
			MimeType:    "application/pdf",
			Size:        88_120,
			Excerpt:     "Master services agreement between Acme Corp and Acme Logs Inc. Annual fee: $42,000 USD billed quarterly. Termination: 60 days written notice. SLA: 99.9% delivery, 1-hour incident response. Data residency: us-east-1.",
			URL:         "https://drive.google.com/file/d/file_acme_vendor_contract/view",
			Permissions: []string{"alice@acme.com:owner", "dave@acme.com:editor"},
			ACL:         []string{"user_alice", "user_bob", "user_dave"},
		},
		{
			ID:          "file_acme_budget",
			ConnectorID: "conn_gdrive_acme",
			Name:        "FY26 Engineering Budget.gsheet",
			MimeType:    "application/vnd.google-apps.spreadsheet",
			Size:        24_400,
			Excerpt:     "FY26 engineering budget. Tooling line item: $180k (logging $45k, observability $60k, CI/CD $35k, security $40k). Variance vs FY25: +6%. Approved by CFO Eve Johnson on 2026-03-12.",
			URL:         "https://drive.google.com/file/d/file_acme_budget/view",
			Permissions: []string{"alice@acme.com:viewer", "eve@acme.com:owner"},
			ACL:         []string{"user_alice", "user_bob"},
		},
		{
			ID:          "file_acme_design_brief",
			ConnectorID: "conn_gdrive_acme",
			Name:        "Logging Dashboard Design Brief.gdoc",
			MimeType:    "application/vnd.google-apps.document",
			Size:        18_640,
			Excerpt:     "Design brief for the new logging dashboard. Primary persona: on-call engineer triaging an incident at 3am. Must surface: error rate, top failing services, recent deploys, and a one-click pivot to traces. Avoid burying the search box.",
			URL:         "https://drive.google.com/file/d/file_acme_design_brief/view",
			Permissions: []string{"alice@acme.com:editor", "dave@acme.com:editor"},
			ACL:         []string{"user_alice", "user_bob", "user_dave"},
		},
	}
	for _, f := range files {
		m.AppendConnectorFile(f)
	}

	// Phase 5 — second seeded connector: a mocked OneDrive account
	// attached to the engineering channel so both B2B channels have a
	// connector. Files mirror the demo's Acme storyline.
	m.PutConnector(models.Connector{
		ID:          "conn_onedrive_acme",
		Kind:        models.ConnectorKindOneDrive,
		Name:        "Acme OneDrive",
		WorkspaceID: "ws_acme",
		ChannelIDs:  []string{"ch_engineering"},
		Status:      models.ConnectorStatusConnected,
		CreatedAt:   now,
	})
	onedriveFiles := []models.ConnectorFile{
		{
			ID:          "file_acme_eng_meeting_notes",
			ConnectorID: "conn_onedrive_acme",
			Name:        "Engineering weekly — meeting notes.docx",
			MimeType:    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			Size:        9_600,
			Excerpt:     "Engineering weekly meeting notes — discussed logging vendor pilot, on-call rotation gaps, and the ticket-triage SLA. Action items: Dave to draft RFC by Friday; Alice to review the Q3 PRD; Eve to confirm budget approval.",
			URL:         "https://acme-my.sharepoint.com/personal/alice_acme_com/Documents/eng-weekly.docx",
			Permissions: []string{"alice@acme.com:owner", "dave@acme.com:editor", "eve@acme.com:editor"},
			ACL:         []string{"user_alice", "user_bob", "user_dave"},
		},
		{
			ID:          "file_acme_quarterly_report",
			ConnectorID: "conn_onedrive_acme",
			Name:        "FY26 Q1 quarterly report.pptx",
			MimeType:    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			Size:        45_120,
			Excerpt:     "Q1 quarterly report — revenue +12% vs plan, engineering shipped logging dashboard MVP, hiring backfilled two infra roles. Risks: vendor contract renewal slipping, on-call burn-rate trending up.",
			URL:         "https://acme-my.sharepoint.com/personal/eve_acme_com/Documents/q1-report.pptx",
			Permissions: []string{"alice@acme.com:viewer", "dave@acme.com:viewer", "eve@acme.com:owner"},
			ACL:         []string{"user_alice", "user_bob"},
		},
		{
			ID:          "file_acme_oncall_runbook",
			ConnectorID: "conn_onedrive_acme",
			Name:        "On-call runbook.docx",
			MimeType:    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			Size:        14_320,
			Excerpt:     "On-call runbook — paging policy, escalation tree, common log-search queries, post-incident review template. Owner: Dave. Reviewed quarterly.",
			URL:         "https://acme-my.sharepoint.com/personal/dave_acme_com/Documents/oncall-runbook.docx",
			Permissions: []string{"alice@acme.com:editor", "dave@acme.com:owner", "eve@acme.com:viewer"},
			ACL:         []string{"user_alice", "user_bob", "user_dave"},
		},
	}
	for _, f := range onedriveFiles {
		m.AppendConnectorFile(f)
	}
}

// seedAIEmployees loads the three Phase 4 demo AI Employees. The
// allowed-channels + recipes lists map directly to the task spec in
// PROPOSAL.md §3.6 and PROGRESS.md Phase 4.
func seedAIEmployees(m *Memory, now time.Time) {
	m.PutAIEmployee(models.AIEmployee{
		ID:          models.KaraOpsAI,
		Name:        "Kara Ops AI",
		Role:        models.AIEmployeeRoleOps,
		AvatarColor: "#0ea5e9",
		Description: "Operations copilot. Keeps vendor-management and general channels moving: summarises threads, extracts action items, and prefills approvals for human review.",
		AllowedChannelIDs: []string{"ch_general", "ch_vendor_management"},
		Recipes:           []string{"summarize", "extract_tasks", "prefill_approval"},
		Budget:            models.AIEmployeeBudget{MaxTokensPerDay: 200000},
		Mode:              models.AIEmployeeModeInline,
		CreatedAt:         now,
	})
	m.PutAIEmployee(models.AIEmployee{
		ID:          models.NinaPMAI,
		Name:        "Nina PM AI",
		Role:        models.AIEmployeeRolePM,
		AvatarColor: "#7c3aed",
		Description: "Product-management copilot for engineering channels. Summarises threads, extracts tasks, and drafts PRDs for a human to edit before publish.",
		AllowedChannelIDs: []string{"ch_engineering"},
		Recipes:           []string{"summarize", "extract_tasks", "draft_prd"},
		Budget:            models.AIEmployeeBudget{MaxTokensPerDay: 250000},
		Mode:              models.AIEmployeeModeInline,
		CreatedAt:         now,
	})
	m.PutAIEmployee(models.AIEmployee{
		ID:          models.MikaSalesAI,
		Name:        "Mika Sales AI",
		Role:        models.AIEmployeeRoleSales,
		AvatarColor: "#16a34a",
		Description: "Sales copilot for vendor-management. Summarises threads, extracts follow-ups, and drafts proposals for human review before anything leaves the workspace.",
		AllowedChannelIDs: []string{"ch_vendor_management"},
		Recipes:           []string{"summarize", "extract_tasks", "draft_proposal"},
		Budget:            models.AIEmployeeBudget{MaxTokensPerDay: 200000},
		Mode:              models.AIEmployeeModeInline,
		CreatedAt:         now,
	})
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
	// B2C — Alice ↔ Minh (English / Vietnamese).
	// The redesigned B2C
	// demo is centred on this channel: every bubble exercises the SLM
	// Translate affordance, both directions (EN→VI for Alice's lines
	// and VI→EN for Minh's). Topics are a relatable weekend-meetup
	// arrangement (new Vietnamese restaurant downtown) so the
	// conversation summary has decisions, action items, and food
	// vocabulary worth surfacing.
	viBase := base.Add(-4 * time.Hour)
	addMsg(m, "msg_minh_1", "ch_dm_alice_minh", "", "user_alice", "Hey Minh! Are you free this Saturday? I was thinking we could check out that new Vietnamese restaurant downtown.", viBase)
	addMsg(m, "msg_minh_2", "ch_dm_alice_minh", "", "user_minh", "Chào Alice! Thứ Bảy này mình rảnh. Nhà hàng nào vậy? Mình nghe nói có một quán phở mới mở ở trung tâm.", viBase.Add(2*time.Minute))
	addMsg(m, "msg_minh_3", "ch_dm_alice_minh", "", "user_alice", "Yes! That's the one. I heard their pho is amazing. Want to meet around noon?", viBase.Add(4*time.Minute))
	addMsg(m, "msg_minh_4", "ch_dm_alice_minh", "", "user_minh", "Trưa được nha! Mình sẽ đặt bàn trước. Bạn có ăn được cay không?", viBase.Add(6*time.Minute))
	addMsg(m, "msg_minh_5", "ch_dm_alice_minh", "", "user_alice", "I can handle a little spice but not too much 😄 Can you order for us since you know Vietnamese food better?", viBase.Add(9*time.Minute))
	addMsg(m, "msg_minh_6", "ch_dm_alice_minh", "", "user_minh", "Được rồi, mình sẽ gọi món cho. Mình sẽ chọn phở bò và gỏi cuốn. Bạn muốn uống gì?", viBase.Add(11*time.Minute))
	addMsg(m, "msg_minh_7", "ch_dm_alice_minh", "", "user_alice", "Iced Vietnamese coffee sounds perfect! I've been wanting to try the real thing.", viBase.Add(13*time.Minute))
	addMsg(m, "msg_minh_8", "ch_dm_alice_minh", "", "user_minh", "Cà phê sữa đá là lựa chọn tuyệt vời! Mình cũng sẽ gọi thêm chè cho tráng miệng.", viBase.Add(15*time.Minute))
	addMsg(m, "msg_minh_9", "ch_dm_alice_minh", "", "user_alice", "What's chè? I don't think I've tried that before.", viBase.Add(18*time.Minute))
	addMsg(m, "msg_minh_10", "ch_dm_alice_minh", "", "user_minh", "Chè là món tráng miệng truyền thống của Việt Nam, có nhiều loại lắm. Mình sẽ chọn chè ba màu cho bạn thử - rất ngon!", viBase.Add(20*time.Minute))
	addMsg(m, "msg_minh_11", "ch_dm_alice_minh", "", "user_alice", "That sounds amazing! I love trying new desserts. Should I bring anything?", viBase.Add(23*time.Minute))
	addMsg(m, "msg_minh_12", "ch_dm_alice_minh", "", "user_minh", "Không cần đâu, chỉ cần mang theo sự háo hức thôi! 😊 Gặp bạn lúc 12 giờ trưa thứ Bảy nhé.", viBase.Add(25*time.Minute))
	addMsg(m, "msg_minh_13", "ch_dm_alice_minh", "", "user_alice", "Perfect! See you Saturday at noon. Can't wait! 🎉", viBase.Add(28*time.Minute))
	addMsg(m, "msg_minh_14", "ch_dm_alice_minh", "", "user_minh", "Hẹn gặp bạn! Mình chắc chắn bạn sẽ thích đồ ăn Việt Nam. À, nhớ mang theo ô phòng khi trời mưa nhé.", viBase.Add(30*time.Minute))
	addMsg(m, "msg_minh_15", "ch_dm_alice_minh", "", "user_alice", "Good call on the umbrella — the forecast does show some rain. Thanks for the heads up!", viBase.Add(33*time.Minute))
	addMsg(m, "msg_minh_16", "ch_dm_alice_minh", "", "user_minh", "Không có gì! Thời tiết mùa này hay thay đổi lắm. Thôi mình đi đặt bàn trước nhé. Tạm biệt!", viBase.Add(35*time.Minute))

	// B2B — vendor-management thread. Drives the approval-prefill demo
	// (PROPOSAL 5.3). The B2B real-LLM redesign expanded this thread to
	// 12 messages so Bonsai-1.7B has enough pricing, risk, compliance, and
	// decision content to populate the approval card autonomously.
	addMsg(m, "msg_vend_root", "ch_vendor_management", "msg_vend_root", "user_dave", "Need to lock vendor pricing for the Q3 logging contract — three bids on the table and Finance wants the decision by next Tuesday.", base.Add(-50*time.Minute))
	addMsg(m, "msg_vend_r1", "ch_vendor_management", "msg_vend_root", "user_eve", "What are the bids, and where do they sit on SOC 2 and GDPR?", base.Add(-48*time.Minute))
	addMsg(m, "msg_vend_r2", "ch_vendor_management", "msg_vend_root", "user_dave", "Acme Logs $42k/yr, BetterLog $51k/yr, CloudTrace $39k/yr. CloudTrace failed our SOC 2 review last quarter so I'd skip them.", base.Add(-45*time.Minute))
	addMsg(m, "msg_vend_r3", "ch_vendor_management", "msg_vend_root", "user_eve", "Agreed, skip CloudTrace. Lean Acme — but I need a pricing breakdown and termination terms before I approve.", base.Add(-43*time.Minute))
	addMsg(m, "msg_vend_r4", "ch_vendor_management", "msg_vend_root", "user_dave", "Pulling the data room link now. Will post pricing + risk + compliance separately so it's easy to cite.", base.Add(-42*time.Minute))
	addMsg(m, "msg_vend_r5", "ch_vendor_management", "msg_vend_root", "user_dave", "Pricing — Acme Logs: $42,000/yr base, $3/GB overage past 5TB, 30-day termination. BetterLog: $51,000/yr base, $2/GB overage past 3TB, 90-day termination.", base.Add(-40*time.Minute))
	addMsg(m, "msg_vend_r6", "ch_vendor_management", "msg_vend_root", "user_dave", "Risk — Acme Logs: SOC 2 Type II (April 2026), GDPR DPA in place, 99.95% uptime SLA, single-region (us-east-1). BetterLog: SOC 2 Type I only, no published uptime SLA, multi-region but no DPA on file.", base.Add(-38*time.Minute))
	addMsg(m, "msg_vend_r7", "ch_vendor_management", "msg_vend_root", "user_dave", "Compliance — Acme published their pen-test report from January and the InfoSec team signed off last week. BetterLog hasn't shared theirs yet.", base.Add(-37*time.Minute))
	addMsg(m, "msg_vend_r8", "ch_vendor_management", "msg_vend_root", "user_alice", "Adding context: Procurement flagged that BetterLog's 90-day termination clause is a non-starter for our quarterly budget cycle.", base.Add(-36*time.Minute))
	addMsg(m, "msg_vend_r9", "ch_vendor_management", "msg_vend_root", "user_eve", "Decision: go with Acme Logs at $42,000/yr. Justification: lowest cost, strongest SOC 2 posture, shortest termination window. Risk: medium — single-region.", base.Add(-35*time.Minute))
	addMsg(m, "msg_vend_r10", "ch_vendor_management", "msg_vend_root", "user_dave", "Filing the approval now — source thread is this one. Will assign Procurement as reviewer and CC Finance.", base.Add(-33*time.Minute))
	addMsg(m, "msg_vend_r11", "ch_vendor_management", "msg_vend_root", "user_alice", "Once it's approved I'll kick off the data-residency mitigation: ask Acme for an us-west-2 replica and put the request in the Q4 plan.", base.Add(-31*time.Minute))

	// B2B — engineering — inline-translation thread (PRD draft demo,
	// PROPOSAL 5.4). Unchanged from Phase 0 so the existing Phase-0
	// artifact card and its source pins remain valid.
	addMsg(m, "msg_eng_root", "ch_engineering", "msg_eng_root", "user_alice", "Kicking off the inline-translation feature. Goal: per-message translation rendered under the bubble, original always one tap away.", base.Add(-30*time.Minute))
	addMsg(m, "msg_eng_r1", "ch_engineering", "msg_eng_root", "user_dave", "requirements I have so far: locale auto-detect, on-device only, fall back to original on low confidence, must work in family group chats.", base.Add(-28*time.Minute))
	addMsg(m, "msg_eng_r2", "ch_engineering", "msg_eng_root", "user_eve", "metric: % messages translated successfully without user toggling back to original. target > 90% for top 5 locales.", base.Add(-25*time.Minute))
	addMsg(m, "msg_eng_r3", "ch_engineering", "msg_eng_root", "user_alice", "good. I'll draft a PRD from this thread and post v1 here for review.", base.Add(-23*time.Minute))

	// B2B — engineering — on-call rotation thread (secondary source for
	// the PRD / artifact demo so there is more than one thread to
	// summarize or draft from).
	addMsg(m, "msg_eng_onc_root", "ch_engineering", "msg_eng_onc_root", "user_dave", "Proposal: move to a weekly on-call rotation with a 2-person primary/secondary split starting next month. Current monthly rotation is burning people out.", base.Add(-15*time.Minute))
	addMsg(m, "msg_eng_onc_r1", "ch_engineering", "msg_eng_onc_root", "user_alice", "+1 to weekly — monthly is brutal on travel weeks. primary/secondary split is the right shape.", base.Add(-14*time.Minute))
	addMsg(m, "msg_eng_onc_r2", "ch_engineering", "msg_eng_onc_root", "user_eve", "compensation: 1 comp day per week on primary, 0.5 per week on secondary. needs sign-off from Finance before we announce.", base.Add(-13*time.Minute))
	addMsg(m, "msg_eng_onc_r3", "ch_engineering", "msg_eng_onc_root", "user_dave", "action items: (1) Alice drafts the rotation calendar, (2) Eve confirms the comp-day budget with Finance, (3) I announce in #general by Friday.", base.Add(-12*time.Minute))
	addMsg(m, "msg_eng_onc_r4", "ch_engineering", "msg_eng_onc_root", "user_alice", "owning (1) — draft calendar by Thursday EOD.", base.Add(-11*time.Minute))

	// B2B — #general. Carries standup-style updates, announcements,
	// and a short planning thread with explicit action items so the
	// summarize / extract-tasks demos have meaningful content.
	addMsg(m, "msg_gen_1", "ch_general", "", "user_eve", "morning everyone — standup in 10", base.Add(-20*time.Minute))
	addMsg(m, "msg_gen_2", "ch_general", "", "user_dave", "joining", base.Add(-19*time.Minute))
	addMsg(m, "msg_gen_3", "ch_general", "", "user_alice", "standup notes: inline-translation demo shipped to staging; approval-flow refactor started; on-call rotation proposal in #engineering (please review).", base.Add(-18*time.Minute))
	addMsg(m, "msg_gen_4", "ch_general", "", "user_dave", "announcement: office closed this Friday for the long weekend — no standup that day.", base.Add(-17*time.Minute))
	addMsg(m, "msg_gen_5", "ch_general", "", "user_eve", "FYI — the new travel-expense form is live in KApp Forms. please file anything open before month-end.", base.Add(-16*time.Minute))

	// Short Q2 OKR thread — explicit owners + action items for the
	// extract_tasks / summarize demos.
	addMsg(m, "msg_gen_okr_root", "ch_general", "msg_gen_okr_root", "user_alice", "need owners for three Q2 OKRs — any volunteers? (1) doc-site refresh, (2) CI time under 10min, (3) customer pilot outreach.", base.Add(-14*time.Minute))
	addMsg(m, "msg_gen_okr_r1", "ch_general", "msg_gen_okr_root", "user_dave", "(1) I'll own the doc-site refresh.", base.Add(-13*time.Minute))
	addMsg(m, "msg_gen_okr_r2", "ch_general", "msg_gen_okr_root", "user_eve", "(2) mine — I have the CI profile already.", base.Add(-12*time.Minute))
	addMsg(m, "msg_gen_okr_r3", "ch_general", "msg_gen_okr_root", "user_alice", "(3) I'll take customer pilot outreach. action: tracking board up by Monday.", base.Add(-11*time.Minute))

	// B2B — #general standup-style updates (added during the B2B
	// redesign so summarise / extract-tasks have multi-owner content
	// with explicit deadlines).
	addMsg(m, "msg_gen_stand_root", "ch_general", "msg_gen_stand_root", "user_alice", "Tuesday standup — status updates by team. I'll start: shipping the inline-translation PR by Wednesday EOD; CI is green and I'm waiting on a design review from Eve.", base.Add(-9*time.Minute))
	addMsg(m, "msg_gen_stand_r1", "ch_general", "msg_gen_stand_root", "user_dave", "Platform: vendor approval routing landed in staging. Need someone from Procurement to validate by Friday before we promote to prod.", base.Add(-8*time.Minute))
	addMsg(m, "msg_gen_stand_r2", "ch_general", "msg_gen_stand_root", "user_eve", "Design review for translation card scheduled for Wednesday 10am — Alice please post the latest mocks before then.", base.Add(-7*time.Minute))
	addMsg(m, "msg_gen_stand_r3", "ch_general", "msg_gen_stand_root", "user_alice", "Will do, posting tonight. Also reminder: company holiday Friday — no standup.", base.Add(-6*time.Minute))

	// B2B — product-launch thread. Cross-functional discussion
	// (marketing / engineering / sales) so Bonsai-1.7B can demonstrate
	// multi-topic summarisation and multi-owner task extraction.
	addMsg(m, "msg_pl_root", "ch_product_launch", "msg_pl_root", "user_alice", "Kicking off the v2.0 launch planning. Target ship date: June 14. Three workstreams need owners — marketing, engineering hardening, and sales enablement.", base.Add(-25*time.Minute))
	addMsg(m, "msg_pl_r1", "ch_product_launch", "msg_pl_root", "user_eve", "Marketing — I'll own the launch blog, press kit, and the customer email blast. Draft blog by June 7, press kit by June 10. Need a hero quote from Alice.", base.Add(-23*time.Minute))
	addMsg(m, "msg_pl_r2", "ch_product_launch", "msg_pl_root", "user_dave", "Engineering hardening — taking that. Plan: feature-freeze June 7, regression burn-down June 8–11, soak-test on staging June 11–13, prod cut June 14 morning.", base.Add(-21*time.Minute))
	addMsg(m, "msg_pl_r3", "ch_product_launch", "msg_pl_root", "user_alice", "Sales enablement — I'll handle. Deliverables: pitch deck refresh, two demo recordings (vendor approval + PRD draft), pricing one-pager. Done by June 10 so AEs have a week to ramp.", base.Add(-19*time.Minute))
	addMsg(m, "msg_pl_r4", "ch_product_launch", "msg_pl_root", "user_eve", "Risk: our largest design partner asked for a private beta on June 12. If we slip prod cut by even a day we'll miss their window.", base.Add(-17*time.Minute))
	addMsg(m, "msg_pl_r5", "ch_product_launch", "msg_pl_root", "user_dave", "Mitigation: I'll keep a 24-hour buffer on the engineering side and we ship the design partner an internal build June 11 if staging soak looks clean.", base.Add(-15*time.Minute))
	addMsg(m, "msg_pl_r6", "ch_product_launch", "msg_pl_root", "user_alice", "Compliance check — the new approval flow needs a re-attestation from Legal before it ships. I'll loop in Legal Monday and ask for a one-week turn.", base.Add(-13*time.Minute))
	addMsg(m, "msg_pl_r7", "ch_product_launch", "msg_pl_root", "user_eve", "Pricing — proposal: bump enterprise tier from $24/user/month to $28 and add the on-device LLM as a feature highlight. Need Finance sign-off by June 5.", base.Add(-11*time.Minute))
	addMsg(m, "msg_pl_r8", "ch_product_launch", "msg_pl_root", "user_dave", "Action items captured: Eve drafts blog (June 7), Eve drafts press kit (June 10), Dave runs feature freeze June 7, Alice owns sales deliverables (June 10), Alice loops Legal Monday, Eve syncs Finance on pricing by June 5.", base.Add(-9*time.Minute))
	addMsg(m, "msg_pl_r9", "ch_product_launch", "msg_pl_root", "user_alice", "Decision: we ship June 14 unless Legal re-attestation slips. If it slips we move to June 21 and notify the design partner.", base.Add(-7*time.Minute))
	addMsg(m, "msg_pl_r10", "ch_product_launch", "msg_pl_root", "user_eve", "Confirmed. I'll set the public ship-date as June 14 in the press kit and draft a contingency note for the design partner.", base.Add(-5*time.Minute))
}

// seedCards is intentionally a no-op as of the Phase 9 B2B
// ground-zero LLM redesign (2026-05-01). Both the B2C and B2B
// surfaces now generate every KApp card (Approval, Artifact, Task,
// Event, Form) at runtime by routing the active channel/thread
// through the on-device LLM via the Action Launcher → recipe →
// `ai:*` IPC handlers. Seeding cards baked the demo to specific
// mock outputs, which made it impossible to tell from the screen
// whether the user was looking at real Bonsai-1.7B inference or a
// hand-crafted fixture.
//
// The function is kept (and called from Seed) so future phases can
// reintroduce small, intentionally-illustrative seed records (e.g.
// archived audit examples) without changing the wiring.
func seedCards(_ *Memory, _ time.Time) {
	// no-op: every B2B card is now generated on-device by the LLM.
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
