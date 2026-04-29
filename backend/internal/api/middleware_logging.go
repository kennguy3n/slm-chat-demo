package api

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
)

// sensitiveLogKeys enumerates fields that may contain message bodies, AI
// prompts/outputs, or artifact contents. These are stripped from any
// structured-log payload before the entry is written, in line with
// Phase 6 §7.2 "no-content logging" — the server log records only
// structural metadata (IDs, sizes, model names, decisions).
var sensitiveLogKeys = map[string]struct{}{
	"body":     {},
	"content":  {},
	"prompt":   {},
	"output":   {},
	"fields":   {},
	"text":     {},
	"message":  {},
	"messages": {},
	"chunk":    {},
}

// SanitizeLogFields returns a shallow copy of details with every known
// sensitive key replaced by the literal "[redacted]". Structural keys
// (IDs, sizes, model names, decisions, statuses, etc.) are passed
// through untouched. Callers should invoke this on any user-supplied
// map before handing it to a logger.
func SanitizeLogFields(details map[string]any) map[string]any {
	if details == nil {
		return nil
	}
	out := make(map[string]any, len(details))
	for k, v := range details {
		if _, ok := sensitiveLogKeys[k]; ok {
			out[k] = "[redacted]"
			continue
		}
		out[k] = v
	}
	return out
}

// StructuralLogger logs only structural request metadata: method, path,
// status, latency, request id, and the resolved user id from the
// request context. It explicitly does NOT log request or response
// bodies — even when the underlying handler accepts JSON payloads
// containing message text or AI prompts.
//
// Wraps every request with a chi WrapResponseWriter so we can read the
// status + bytes-written without buffering the body.
func StructuralLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()

		defer func() {
			reqID := middleware.GetReqID(r.Context())
			userID := ""
			if u, ok := userctx.From(r.Context()); ok {
				userID = u.ID
			}
			log.Printf(
				"%s %s status=%d bytes=%d latency=%s reqID=%s userID=%s",
				r.Method,
				r.URL.Path,
				ww.Status(),
				ww.BytesWritten(),
				time.Since(start),
				reqID,
				userID,
			)
		}()

		next.ServeHTTP(ww, r)
	})
}
