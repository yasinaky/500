// Package server wires configuration, middleware and routes into an
// http.Handler. Public endpoints (health) sit outside auth; the /api surface
// sits behind the auth middleware so every handler has a verified, org-scoped
// identity.
package server

import (
	"net/http"

	"github.com/yasinaky/500/internal/auth"
	"github.com/yasinaky/500/internal/httpx"
	"github.com/yasinaky/500/internal/projects"
)

// New builds the top-level HTTP handler.
func New(verifier *auth.Verifier, store projects.Store) http.Handler {
	// Protected API routes.
	api := http.NewServeMux()
	projects.NewHandler(store).Routes(api)

	root := http.NewServeMux()
	// Public: liveness probe for load balancers / CI.
	root.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	// Everything under /api requires a valid Supabase token.
	root.Handle("/api/", verifier.Middleware(api))

	return root
}
