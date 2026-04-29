package store

import (
	"sort"
	"sync"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// Memory is an in-memory store backed by maps with a single RWMutex. It is the
// only store implementation in Phase 0; PostgreSQL is added in a later phase.
type Memory struct {
	mu sync.RWMutex

	users         map[string]models.User
	workspaces    map[string]models.Workspace
	channels      map[string]models.Channel
	messages      map[string]models.Message
	cards         []models.Card
	formTemplates map[string]models.FormTemplate
	forms         []models.Form
	auditLog      []models.AuditEntry
	aiEmployees   map[string]models.AIEmployee
	recipeRuns    []models.RecipeRun
	connectors    map[string]models.Connector
	connectorFiles []models.ConnectorFile
	retrievalChunks []models.RetrievalChunk
	knowledgeEntities []models.KnowledgeEntity
}

// NewMemory returns an empty Memory store. Call Seed to populate it with the
// Phase 0 demo data.
func NewMemory() *Memory {
	return &Memory{
		users:         map[string]models.User{},
		workspaces:    map[string]models.Workspace{},
		channels:      map[string]models.Channel{},
		messages:      map[string]models.Message{},
		cards:         []models.Card{},
		formTemplates: map[string]models.FormTemplate{},
		forms:         []models.Form{},
		auditLog:      []models.AuditEntry{},
		aiEmployees:    map[string]models.AIEmployee{},
		recipeRuns:     []models.RecipeRun{},
		connectors:     map[string]models.Connector{},
		connectorFiles: []models.ConnectorFile{},
		retrievalChunks: []models.RetrievalChunk{},
		knowledgeEntities: []models.KnowledgeEntity{},
	}
}

// User lookups.

func (m *Memory) GetUser(id string) (models.User, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.users[id]
	return u, ok
}

func (m *Memory) ListUsers() []models.User {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.User, 0, len(m.users))
	for _, u := range m.users {
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (m *Memory) PutUser(u models.User) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users[u.ID] = u
}

// Workspace lookups.

func (m *Memory) ListWorkspaces() []models.Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Workspace, 0, len(m.workspaces))
	for _, w := range m.workspaces {
		out = append(out, w)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (m *Memory) GetWorkspace(id string) (models.Workspace, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	w, ok := m.workspaces[id]
	return w, ok
}

func (m *Memory) PutWorkspace(w models.Workspace) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.workspaces[w.ID] = w
}

// Channel lookups.

func (m *Memory) PutChannel(c models.Channel) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.channels[c.ID] = c
}

func (m *Memory) GetChannel(id string) (models.Channel, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.channels[id]
	return c, ok
}

// ListChannels returns channels filtered by workspace and (optionally) context.
// Pass an empty workspace to ignore workspace filtering, and an empty context
// to ignore context filtering.
func (m *Memory) ListChannels(workspaceID string, ctx models.Context) []models.Channel {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Channel{}
	for _, c := range m.channels {
		if workspaceID != "" && c.WorkspaceID != workspaceID {
			continue
		}
		if ctx != "" && c.Context != ctx {
			continue
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ListChannelsForUser returns channels in the requested context that include
// the given user as a member. Channels are sorted by ID for deterministic output.
func (m *Memory) ListChannelsForUser(userID string, ctx models.Context) []models.Channel {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Channel{}
	for _, c := range m.channels {
		if ctx != "" && c.Context != ctx {
			continue
		}
		if !contains(c.MemberIDs, userID) {
			continue
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Message lookups.

func (m *Memory) PutMessage(msg models.Message) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages[msg.ID] = msg
}

// GetMessage returns a single message by ID. Used by handlers that need
// to look up a specific message (translate, extract-tasks) without
// scanning every channel.
func (m *Memory) GetMessage(id string) (models.Message, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	msg, ok := m.messages[id]
	return msg, ok
}

// ListChannelMessages returns the top-level messages for a channel (i.e. messages
// whose ThreadID is empty or equal to their ID), sorted by CreatedAt.
func (m *Memory) ListChannelMessages(channelID string) []models.Message {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Message{}
	for _, msg := range m.messages {
		if msg.ChannelID != channelID {
			continue
		}
		if msg.ThreadID != "" && msg.ThreadID != msg.ID {
			continue
		}
		out = append(out, msg)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// ListThreadMessages returns all messages belonging to a thread (root + replies),
// sorted by CreatedAt.
func (m *Memory) ListThreadMessages(threadID string) []models.Message {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Message{}
	for _, msg := range m.messages {
		if msg.ThreadID == threadID || msg.ID == threadID {
			out = append(out, msg)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// Card lookups.

// PutCard appends a card to the in-memory card list. Cards are stored in
// insertion order so seeded sample cards render with a stable ordering in
// the demo.
func (m *Memory) PutCard(c models.Card) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cards = append(m.cards, c)
}

// ListCards returns all seeded KApp cards. Phase 0 returns every card; later
// phases will scope by channel and visibility.
func (m *Memory) ListCards() []models.Card {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Card, len(m.cards))
	copy(out, m.cards)
	return out
}

// FindTask returns a pointer to the embedded task in the card list (and its
// index) so the caller can mutate it under the same lock.
func (m *Memory) findTaskLocked(id string) (*models.Task, int) {
	for i := range m.cards {
		c := &m.cards[i]
		if c.Kind == models.CardKindTask && c.Task != nil && c.Task.ID == id {
			return c.Task, i
		}
	}
	return nil, -1
}

func (m *Memory) findApprovalLocked(id string) (*models.Approval, int) {
	for i := range m.cards {
		c := &m.cards[i]
		if c.Kind == models.CardKindApproval && c.Approval != nil && c.Approval.ID == id {
			return c.Approval, i
		}
	}
	return nil, -1
}

// GetTask looks up a task card by ID.
func (m *Memory) GetTask(id string) (models.Task, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, _ := m.findTaskLocked(id)
	if t == nil {
		return models.Task{}, false
	}
	return *t, true
}

// ListTasks returns every task card. An empty channelID returns all tasks;
// otherwise only tasks scoped to that channel are returned. Tasks are returned
// in insertion order so the demo timeline stays deterministic.
func (m *Memory) ListTasks(channelID string) []models.Task {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Task{}
	for _, c := range m.cards {
		if c.Kind != models.CardKindTask || c.Task == nil {
			continue
		}
		if channelID != "" && c.Task.ChannelID != channelID {
			continue
		}
		out = append(out, *c.Task)
	}
	return out
}

// CreateTask appends a new task card and returns the persisted task.
func (m *Memory) CreateTask(t models.Task) models.Task {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t.Status == "" {
		t.Status = models.TaskStatusOpen
	}
	if t.History == nil {
		t.History = []models.TaskHistoryEntry{}
	}
	threadID := t.SourceThreadID
	if threadID == "" {
		threadID = t.SourceMessageID
	}
	m.cards = append(m.cards, models.Card{Kind: models.CardKindTask, ThreadID: threadID, Task: &t})
	return t
}

// UpdateTask applies the supplied mutator to the stored task and records the
// mutation as a history entry. Returns the updated task and a boolean
// indicating whether the task existed.
func (m *Memory) UpdateTask(id string, mutate func(*models.Task)) (models.Task, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, _ := m.findTaskLocked(id)
	if t == nil {
		return models.Task{}, false
	}
	mutate(t)
	return *t, true
}

// DeleteTask removes a task card by ID. Returns true on success.
func (m *Memory) DeleteTask(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, idx := m.findTaskLocked(id)
	if idx < 0 {
		return false
	}
	m.cards = append(m.cards[:idx], m.cards[idx+1:]...)
	return true
}

// GetApproval returns an approval card by ID.
func (m *Memory) GetApproval(id string) (models.Approval, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a, _ := m.findApprovalLocked(id)
	if a == nil {
		return models.Approval{}, false
	}
	return *a, true
}

// UpdateApproval applies the supplied mutator to the stored approval. Returns
// the updated approval and a boolean indicating whether it existed.
func (m *Memory) UpdateApproval(id string, mutate func(*models.Approval)) (models.Approval, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, _ := m.findApprovalLocked(id)
	if a == nil {
		return models.Approval{}, false
	}
	mutate(a)
	return *a, true
}

// CreateApproval appends a new approval card and returns the persisted
// approval. Phase 3 — supports the POST /api/kapps/approvals submit flow.
func (m *Memory) CreateApproval(a models.Approval) models.Approval {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a.Status == "" {
		a.Status = models.ApprovalStatusPending
	}
	if a.DecisionLog == nil {
		a.DecisionLog = []models.ApprovalDecisionEntry{}
	}
	if a.Approvers == nil {
		a.Approvers = []string{}
	}
	threadID := a.SourceThreadID
	m.cards = append(m.cards, models.Card{Kind: models.CardKindApproval, ThreadID: threadID, Approval: &a})
	return a
}

// ---- Artifacts ----

func (m *Memory) findArtifactLocked(id string) (*models.Artifact, int) {
	for i := range m.cards {
		c := &m.cards[i]
		if c.Kind == models.CardKindArtifact && c.Artifact != nil && c.Artifact.ID == id {
			return c.Artifact, i
		}
	}
	return nil, -1
}

// CreateArtifact appends a new artifact card and returns the persisted artifact.
func (m *Memory) CreateArtifact(a models.Artifact) models.Artifact {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a.Status == "" {
		a.Status = models.ArtifactStatusDraft
	}
	if a.Versions == nil {
		a.Versions = []models.ArtifactVersion{}
	}
	threadID := ""
	if len(a.SourceRefs) > 0 {
		threadID = a.SourceRefs[0].ID
	}
	m.cards = append(m.cards, models.Card{Kind: models.CardKindArtifact, ThreadID: threadID, Artifact: &a})
	return a
}

// GetArtifact returns the full artifact (including version bodies) by ID.
func (m *Memory) GetArtifact(id string) (models.Artifact, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a, _ := m.findArtifactLocked(id)
	if a == nil {
		return models.Artifact{}, false
	}
	return *a, true
}

// ListArtifacts returns artifact cards, optionally filtered by channel.
// Versions are returned with bodies stripped — callers needing the full
// body should call GetArtifact for the specific id.
func (m *Memory) ListArtifacts(channelID string) []models.Artifact {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Artifact{}
	for _, c := range m.cards {
		if c.Kind != models.CardKindArtifact || c.Artifact == nil {
			continue
		}
		if channelID != "" && c.Artifact.ChannelID != channelID {
			continue
		}
		// Copy versions but elide bodies for list payload size.
		copy := *c.Artifact
		stripped := make([]models.ArtifactVersion, len(c.Artifact.Versions))
		for i, v := range c.Artifact.Versions {
			v.Body = ""
			stripped[i] = v
		}
		copy.Versions = stripped
		out = append(out, copy)
	}
	return out
}

// UpdateArtifact applies a mutator to the stored artifact. Returns the updated
// artifact and true on success.
func (m *Memory) UpdateArtifact(id string, mutate func(*models.Artifact)) (models.Artifact, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, _ := m.findArtifactLocked(id)
	if a == nil {
		return models.Artifact{}, false
	}
	mutate(a)
	return *a, true
}

// ---- Form templates / forms ----

func (m *Memory) PutFormTemplate(t models.FormTemplate) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.formTemplates[t.ID] = t
}

func (m *Memory) GetFormTemplate(id string) (models.FormTemplate, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.formTemplates[id]
	return t, ok
}

func (m *Memory) ListFormTemplates() []models.FormTemplate {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.FormTemplate, 0, len(m.formTemplates))
	for _, t := range m.formTemplates {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// CreateForm persists a new Form intake. Phase 3 — backs POST /api/kapps/forms.
func (m *Memory) CreateForm(f models.Form) models.Form {
	m.mu.Lock()
	defer m.mu.Unlock()
	if f.Status == "" {
		f.Status = models.FormStatusDraft
	}
	if f.Fields == nil {
		f.Fields = map[string]string{}
	}
	m.forms = append(m.forms, f)
	return f
}

// ListForms returns forms scoped to a channel (empty channelID returns all).
func (m *Memory) ListForms(channelID string) []models.Form {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Form{}
	for _, f := range m.forms {
		if channelID != "" && f.ChannelID != channelID {
			continue
		}
		out = append(out, f)
	}
	return out
}

// CardsForThread returns every card whose ThreadID matches threadID.
func (m *Memory) CardsForThread(threadID string) []models.Card {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Card{}
	if threadID == "" {
		return out
	}
	for _, c := range m.cards {
		if c.ThreadID == threadID {
			out = append(out, c)
		}
	}
	return out
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

// ---- Audit log (immutable, append-only) ----

// AppendAuditEntry records a single audit row. The log is append-only:
// entries are never mutated or removed.
func (m *Memory) AppendAuditEntry(e models.AuditEntry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.auditLog = append(m.auditLog, e)
}

// ---- AI Employees (Phase 4) ----

// PutAIEmployee upserts an AI Employee profile keyed by ID.
func (m *Memory) PutAIEmployee(e models.AIEmployee) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.aiEmployees[e.ID] = e
}

// GetAIEmployee returns the AI Employee with the given ID, if any.
func (m *Memory) GetAIEmployee(id string) (models.AIEmployee, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.aiEmployees[id]
	return e, ok
}

// ListAIEmployees returns every seeded AI Employee sorted by ID so the
// demo sidebar / right-rail panel render in a deterministic order.
func (m *Memory) ListAIEmployees() []models.AIEmployee {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.AIEmployee, 0, len(m.aiEmployees))
	for _, e := range m.aiEmployees {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// UpdateAIEmployee applies the supplied mutator to the stored AI
// Employee. Returns the updated profile and true on success; false if
// the employee does not exist.
func (m *Memory) UpdateAIEmployee(id string, mutate func(*models.AIEmployee)) (models.AIEmployee, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.aiEmployees[id]
	if !ok {
		return models.AIEmployee{}, false
	}
	mutate(&e)
	m.aiEmployees[id] = e
	return e, true
}

// ListAuditEntries returns audit entries filtered by objectId and/or
// objectKind. An empty filter for either argument disables that filter;
// passing both empty strings returns the full log. Entries are returned
// in insertion (chronological) order.
func (m *Memory) ListAuditEntries(objectID string, objectKind string) []models.AuditEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.AuditEntry{}
	for _, e := range m.auditLog {
		if objectID != "" && e.ObjectID != objectID {
			continue
		}
		if objectKind != "" && string(e.ObjectKind) != objectKind {
			continue
		}
		out = append(out, e)
	}
	return out
}

// AppendRecipeRun records a recipe-run queue entry. The log is
// append-only except via UpdateRecipeRun (status / completion).
func (m *Memory) AppendRecipeRun(run models.RecipeRun) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.recipeRuns = append(m.recipeRuns, run)
}

// ListRecipeRuns returns every recipe run, optionally filtered to a
// single AI Employee. Runs are returned in insertion (chronological)
// order so the Queue view can render newest-first via the caller.
func (m *Memory) ListRecipeRuns(aiEmployeeID string) []models.RecipeRun {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.RecipeRun{}
	for _, r := range m.recipeRuns {
		if aiEmployeeID != "" && r.AIEmployeeID != aiEmployeeID {
			continue
		}
		out = append(out, r)
	}
	return out
}

// UpdateRecipeRun applies a mutator to the stored recipe run with the
// given ID. Returns the updated run and true on success; false if no
// such run exists.
func (m *Memory) UpdateRecipeRun(id string, mutate func(*models.RecipeRun)) (models.RecipeRun, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.recipeRuns {
		if m.recipeRuns[i].ID != id {
			continue
		}
		mutate(&m.recipeRuns[i])
		return m.recipeRuns[i], true
	}
	return models.RecipeRun{}, false
}

// ---- Connectors (Phase 5) ----

// PutConnector upserts a connector keyed by ID.
func (m *Memory) PutConnector(c models.Connector) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connectors[c.ID] = c
}

// GetConnector returns the connector with the given ID, if any.
func (m *Memory) GetConnector(id string) (models.Connector, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.connectors[id]
	return c, ok
}

// ListConnectors returns connectors for a workspace, sorted by ID.
// Passing an empty workspaceID returns every seeded connector.
func (m *Memory) ListConnectors(workspaceID string) []models.Connector {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Connector, 0, len(m.connectors))
	for _, c := range m.connectors {
		if workspaceID != "" && c.WorkspaceID != workspaceID {
			continue
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// UpdateConnector applies a mutator to the stored connector. Returns
// the updated record and true on success; false if no such connector
// exists.
func (m *Memory) UpdateConnector(id string, mutate func(*models.Connector)) (models.Connector, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.connectors[id]
	if !ok {
		return models.Connector{}, false
	}
	mutate(&c)
	m.connectors[id] = c
	return c, true
}

// AppendConnectorFile records a new connector file. Phase 5 seeds
// every file at startup; SyncACL is the only public mutator for
// existing files.
func (m *Memory) AppendConnectorFile(f models.ConnectorFile) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connectorFiles = append(m.connectorFiles, f)
}

// GetConnectorFile returns the file matching `fileID` plus a bool
// indicating whether one was found.
func (m *Memory) GetConnectorFile(fileID string) (models.ConnectorFile, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, f := range m.connectorFiles {
		if f.ID == fileID {
			return f, true
		}
	}
	return models.ConnectorFile{}, false
}

// UpdateConnectorFile applies `mutate` to every file whose connector
// is `connectorID`, persists the change, and returns the updated
// file slice. Used by ConnectorService.SyncACL to refresh the
// machine-readable ACL list on every file in a connector under a
// single write lock.
func (m *Memory) UpdateConnectorFile(connectorID string, mutate func(*models.ConnectorFile)) []models.ConnectorFile {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []models.ConnectorFile{}
	for i := range m.connectorFiles {
		if m.connectorFiles[i].ConnectorID != connectorID {
			continue
		}
		mutate(&m.connectorFiles[i])
		out = append(out, m.connectorFiles[i])
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ListConnectorFiles returns every file stored for a single connector,
// sorted by ID for deterministic rendering.
func (m *Memory) ListConnectorFiles(connectorID string) []models.ConnectorFile {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.ConnectorFile{}
	for _, f := range m.connectorFiles {
		if f.ConnectorID != connectorID {
			continue
		}
		out = append(out, f)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ListConnectorFilesByChannel returns the union of files across every
// connector currently attached to `channelID`. Channel-scoped
// attachment is the privacy boundary for Phase 5 — a file is only
// visible to AI / pickers in the channels its connector is attached
// to.
func (m *Memory) ListConnectorFilesByChannel(channelID string) []models.ConnectorFile {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if channelID == "" {
		return []models.ConnectorFile{}
	}
	allowed := map[string]struct{}{}
	for _, c := range m.connectors {
		for _, cid := range c.ChannelIDs {
			if cid == channelID {
				allowed[c.ID] = struct{}{}
				break
			}
		}
	}
	out := []models.ConnectorFile{}
	for _, f := range m.connectorFiles {
		if _, ok := allowed[f.ConnectorID]; !ok {
			continue
		}
		out = append(out, f)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ---- Retrieval index (Phase 5) ----

// AppendChunks stores `chunks` in the retrieval index. The index is
// append-only except via ClearChannelChunks (called before re-indexing
// a channel).
func (m *Memory) AppendChunks(chunks []models.RetrievalChunk) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.retrievalChunks = append(m.retrievalChunks, chunks...)
}

// ListChunksByChannel returns every retrieval chunk recorded for the
// given channel, in insertion order.
func (m *Memory) ListChunksByChannel(channelID string) []models.RetrievalChunk {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.RetrievalChunk{}
	for _, c := range m.retrievalChunks {
		if c.ChannelID == channelID {
			out = append(out, c)
		}
	}
	return out
}

// ClearChannelChunks removes every retrieval chunk for the given
// channel. Called by the retrieval service before each (re-)index so
// stale chunks don't accumulate.
func (m *Memory) ClearChannelChunks(channelID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	kept := m.retrievalChunks[:0]
	for _, c := range m.retrievalChunks {
		if c.ChannelID == channelID {
			continue
		}
		kept = append(kept, c)
	}
	m.retrievalChunks = kept
}

// ListAllChannelMessages returns every message in a channel, including
// thread replies, sorted by CreatedAt. The retrieval index uses this
// so thread replies are searchable too.
func (m *Memory) ListAllChannelMessages(channelID string) []models.Message {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Message{}
	for _, msg := range m.messages {
		if msg.ChannelID != channelID {
			continue
		}
		out = append(out, msg)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// ---- Knowledge graph (Phase 5) ----

// AppendKnowledgeEntity records a new entity in the knowledge graph.
// The graph is append-only at the store level — re-extraction in the
// service layer drops prior entities for the channel before
// re-appending.
func (m *Memory) AppendKnowledgeEntity(e models.KnowledgeEntity) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.knowledgeEntities = append(m.knowledgeEntities, e)
}

// ListKnowledgeEntities returns entities filtered by channel and
// optionally by kind. Empty `channelID` returns every entity. Empty
// `kind` returns every kind.
func (m *Memory) ListKnowledgeEntities(channelID string, kind string) []models.KnowledgeEntity {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.KnowledgeEntity{}
	for _, e := range m.knowledgeEntities {
		if channelID != "" && e.ChannelID != channelID {
			continue
		}
		if kind != "" && string(e.Kind) != kind {
			continue
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// GetKnowledgeEntity returns a single entity by ID.
func (m *Memory) GetKnowledgeEntity(id string) (models.KnowledgeEntity, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, e := range m.knowledgeEntities {
		if e.ID == id {
			return e, true
		}
	}
	return models.KnowledgeEntity{}, false
}

// ClearKnowledgeEntitiesForChannel removes every entity scoped to
// `channelID`. The knowledge service calls this before each
// re-extraction so stale entities don't accumulate across runs.
func (m *Memory) ClearKnowledgeEntitiesForChannel(channelID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if channelID == "" {
		return
	}
	kept := m.knowledgeEntities[:0]
	for _, e := range m.knowledgeEntities {
		if e.ChannelID == channelID {
			continue
		}
		kept = append(kept, e)
	}
	m.knowledgeEntities = kept
}
