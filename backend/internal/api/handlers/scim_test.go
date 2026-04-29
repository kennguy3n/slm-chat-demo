package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

type scimEmail struct {
	Value   string `json:"value"`
	Type    string `json:"type"`
	Primary bool   `json:"primary"`
}

type scimUserBody struct {
	Schemas     []string    `json:"schemas"`
	ID          string      `json:"id"`
	UserName    string      `json:"userName"`
	DisplayName string      `json:"displayName"`
	Emails      []scimEmail `json:"emails"`
	Active      bool        `json:"active"`
}

type scimListBody struct {
	Schemas      []string       `json:"schemas"`
	TotalResults int            `json:"totalResults"`
	Resources    []scimUserBody `json:"Resources"`
}

func TestSCIMListReturnsSeededUsers(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/scim/v2/Users", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var list scimListBody
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(list.Resources) < 5 {
		t.Errorf("expected at least 5 seeded users, got %d", len(list.Resources))
	}
	if list.TotalResults != len(list.Resources) {
		t.Errorf("totalResults mismatch: %d vs %d", list.TotalResults, len(list.Resources))
	}
	for _, u := range list.Resources {
		found := false
		for _, s := range u.Schemas {
			if s == "urn:ietf:params:scim:schemas:core:2.0:User" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("user %s missing SCIM core schema", u.ID)
		}
	}
}

func TestSCIMCreateAddsUser(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{
		"schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
		"userName": "frank.zoo@acme.example.com",
		"displayName": "Frank Zoo",
		"emails": [{"value":"frank.zoo@acme.example.com","type":"work","primary":true}],
		"active": true
	}`)
	rec := doRequest(t, h, http.MethodPost, "/api/scim/v2/Users", "", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	var created scimUserBody
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.ID == "" {
		t.Fatalf("expected non-empty id")
	}
	if !created.Active {
		t.Errorf("expected active=true")
	}

	rec = doGet(t, h, "/api/scim/v2/Users/"+created.ID, "")
	if rec.Code != http.StatusOK {
		t.Errorf("get after create: %d", rec.Code)
	}
}

func TestSCIMDeleteDeactivates(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, http.MethodDelete, "/api/scim/v2/Users/user_bob", "", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
	}

	rec = doGet(t, h, "/api/scim/v2/Users/user_bob", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get: %d", rec.Code)
	}
	var u scimUserBody
	_ = json.Unmarshal(rec.Body.Bytes(), &u)
	if u.Active {
		t.Errorf("expected user_bob to be inactive after DELETE")
	}
}

func TestSCIMPatchUpdatesFields(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"displayName":"Bobby M","active":false}`)
	rec := doRequest(t, h, http.MethodPatch, "/api/scim/v2/Users/user_bob", "", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
	}
	var u scimUserBody
	_ = json.Unmarshal(rec.Body.Bytes(), &u)
	if u.DisplayName != "Bobby M" {
		t.Errorf("expected displayName=Bobby M, got %q", u.DisplayName)
	}
	if u.Active {
		t.Errorf("expected active=false")
	}
}

func TestSCIMGetUnknownReturns404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/scim/v2/Users/user_missing", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
