package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// SCIM implements a minimum-viable subset of SCIM v2 user
// provisioning (RFC 7644). Phase 6 ships only the User resource — Group
// provisioning lands in the production-hardening phase.
type SCIM struct {
	store *store.Memory
}

func NewSCIM(s *store.Memory) *SCIM {
	return &SCIM{store: s}
}

const (
	scimUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User"
	scimListSchema = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
)

// scimEmail mirrors the SCIM Email multi-valued attribute. We always
// emit a single primary entry with `type: "work"`.
type scimEmail struct {
	Value   string `json:"value"`
	Type    string `json:"type,omitempty"`
	Primary bool   `json:"primary,omitempty"`
}

type scimUser struct {
	Schemas     []string    `json:"schemas"`
	ID          string      `json:"id"`
	UserName    string      `json:"userName"`
	DisplayName string      `json:"displayName,omitempty"`
	Emails      []scimEmail `json:"emails"`
	Active      bool        `json:"active"`
}

type scimList struct {
	Schemas      []string   `json:"schemas"`
	TotalResults int        `json:"totalResults"`
	Resources    []scimUser `json:"Resources"`
}

func toSCIMUser(u models.User) scimUser {
	emails := []scimEmail{}
	if u.Email != "" {
		emails = append(emails, scimEmail{Value: u.Email, Type: "work", Primary: true})
	}
	return scimUser{
		Schemas:     []string{scimUserSchema},
		ID:          u.ID,
		UserName:    u.Email,
		DisplayName: u.DisplayName,
		Emails:      emails,
		Active:      u.Active,
	}
}

// scimUserPayload is the input for POST/PATCH. We intentionally accept
// a loose superset (some providers send `name.givenName` etc.) and
// pluck only the fields we care about.
type scimUserPayload struct {
	UserName    string      `json:"userName"`
	DisplayName string      `json:"displayName"`
	Emails      []scimEmail `json:"emails"`
	Active      *bool       `json:"active,omitempty"`
	Name        struct {
		GivenName  string `json:"givenName"`
		FamilyName string `json:"familyName"`
	} `json:"name"`
	Schemas []string `json:"schemas"`
}

func writeSCIM(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/scim+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// List handles GET /api/scim/v2/Users.
func (h *SCIM) List(w http.ResponseWriter, r *http.Request) {
	users := h.store.ListUsers()
	resources := make([]scimUser, 0, len(users))
	for _, u := range users {
		resources = append(resources, toSCIMUser(u))
	}
	writeSCIM(w, http.StatusOK, scimList{
		Schemas:      []string{scimListSchema},
		TotalResults: len(resources),
		Resources:    resources,
	})
}

// Get handles GET /api/scim/v2/Users/{id}.
func (h *SCIM) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, ok := h.store.GetUser(id)
	if !ok {
		writeSCIM(w, http.StatusNotFound, map[string]string{"detail": "user not found"})
		return
	}
	writeSCIM(w, http.StatusOK, toSCIMUser(u))
}

// Create handles POST /api/scim/v2/Users.
func (h *SCIM) Create(w http.ResponseWriter, r *http.Request) {
	var p scimUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeSCIM(w, http.StatusBadRequest, map[string]string{"detail": "invalid JSON body"})
		return
	}
	email := primaryEmail(p)
	if p.UserName == "" {
		p.UserName = email
	}
	if email == "" {
		writeSCIM(w, http.StatusBadRequest, map[string]string{"detail": "emails[].value is required"})
		return
	}
	displayName := p.DisplayName
	if displayName == "" {
		displayName = strings.TrimSpace(p.Name.GivenName + " " + p.Name.FamilyName)
	}
	if displayName == "" {
		displayName = p.UserName
	}
	id := scimIDFromEmail(email)
	active := true
	if p.Active != nil {
		active = *p.Active
	}
	user := models.User{
		ID:          id,
		DisplayName: displayName,
		Email:       email,
		AvatarColor: "#475569",
		Active:      active,
	}
	if !h.store.CreateUser(user) {
		writeSCIM(w, http.StatusConflict, map[string]string{"detail": "user already exists"})
		return
	}
	writeSCIM(w, http.StatusCreated, toSCIMUser(user))
}

// Patch handles PATCH /api/scim/v2/Users/{id}. The Phase 6 stub accepts
// either the SCIM PatchOp shape OR a flat scimUserPayload with the
// fields to merge. We normalise both into the same code path.
func (h *SCIM) Patch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, ok := h.store.GetUser(id)
	if !ok {
		writeSCIM(w, http.StatusNotFound, map[string]string{"detail": "user not found"})
		return
	}
	var p scimUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeSCIM(w, http.StatusBadRequest, map[string]string{"detail": "invalid JSON body"})
		return
	}
	if p.DisplayName != "" {
		u.DisplayName = p.DisplayName
	}
	if email := primaryEmail(p); email != "" {
		u.Email = email
	}
	if p.Active != nil {
		u.Active = *p.Active
	}
	h.store.PutUser(u)
	writeSCIM(w, http.StatusOK, toSCIMUser(u))
}

// Delete handles DELETE /api/scim/v2/Users/{id} — soft-deactivates.
func (h *SCIM) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.store.DeactivateUser(id) {
		writeSCIM(w, http.StatusNotFound, map[string]string{"detail": "user not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func primaryEmail(p scimUserPayload) string {
	for _, e := range p.Emails {
		if e.Primary && e.Value != "" {
			return e.Value
		}
	}
	for _, e := range p.Emails {
		if e.Value != "" {
			return e.Value
		}
	}
	if p.UserName != "" && strings.Contains(p.UserName, "@") {
		return p.UserName
	}
	return ""
}

func scimIDFromEmail(email string) string {
	local := email
	if at := strings.Index(email, "@"); at > 0 {
		local = email[:at]
	}
	local = strings.ToLower(strings.ReplaceAll(local, ".", "_"))
	if local == "" {
		local = "user"
	}
	return "user_" + local
}
