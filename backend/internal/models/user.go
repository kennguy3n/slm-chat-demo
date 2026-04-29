package models

// User represents a KChat user. The Phase 0 demo uses mock users only;
// no real authentication is performed. Phase 6 added the `Active` flag
// so SCIM provisioning can deactivate a user without deleting the row.
type User struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	AvatarColor string `json:"avatarColor"`
	// Active is true for normally-provisioned users. Set false by the
	// SCIM `DELETE /Users/{id}` handler to soft-deactivate without
	// breaking audit-log foreign keys.
	Active bool `json:"active"`
}
