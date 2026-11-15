// Package server wires configuration, middleware and routes into an
// http.Handler. The SPA and health/config endpoints are public; the /api
// surface sits behind the auth middleware so every handler has a verified,
// org-scoped identity.
package server

import (
	"log/slog"
	"net/http"

	"github.com/yasinaky/500/internal/auth"
	"github.com/yasinaky/500/internal/config"
	"github.com/yasinaky/500/internal/httpx"
	"github.com/yasinaky/500/internal/projects"
	"github.com/yasinaky/500/web"
)

// New builds the top-level HTTP handler.
func New(cfg config.Config, verifier *auth.Verifier, store projects.Store, logger *slog.Logger) http.Handler {
	// Protected API routes.
	api := http.NewServeMux()
	projects.NewHandler(store).Routes(api)

	root := http.NewServeMux()

	// Public: liveness probe for load balancers / CI.
	root.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Public: frontend config (anon key only; never the JWT secret).
	root.HandleFunc("GET /config.json", web.ConfigHandler(web.PublicConfig{
		SupabaseURL:     cfg.SupabaseURL,
		SupabaseAnonKey: cfg.SupabaseAnonKey,
		DevAuth:         cfg.DevAuth,
	}))

	// Local-dev-only token endpoint.
	if cfg.DevAuth {
		logger.Warn("DEV_AUTH is enabled: /dev/login mints tokens without Supabase — do not use in production")
		root.HandleFunc("POST /dev/login", web.DevLoginHandler(cfg.JWTSecret, cfg.JWTAudience))
	}

	// Everything under /api requires a valid Supabase token.
	root.Handle("/api/", verifier.Middleware(api))

	// Everything else: the embedded single-page app.
	root.Handle("/", web.FileServer())

	return root
}
