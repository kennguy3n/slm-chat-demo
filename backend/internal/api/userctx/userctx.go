// Package userctx holds the request-context key/helpers for the user attached
// by the mock-auth middleware. It lives in its own package so that handlers
// can read the user without importing the api package (which would form an
// import cycle through router -> handlers -> api).
package userctx

import (
	"context"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

type ctxKey string

const userKey ctxKey = "user"

// With returns a new context that carries the given user.
func With(ctx context.Context, u models.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// From returns the user attached to ctx, plus a bool indicating whether one
// was present.
func From(ctx context.Context) (models.User, bool) {
	u, ok := ctx.Value(userKey).(models.User)
	return u, ok
}
