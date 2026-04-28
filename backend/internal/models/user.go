package models

// User represents a KChat user. The Phase 0 demo uses mock users only;
// no real authentication is performed.
type User struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	AvatarColor string `json:"avatarColor"`
}
