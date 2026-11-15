// Package web serves the single-page frontend, embedded into the binary so the
// whole app ships and deploys as one artifact. It also exposes the public
// frontend config (/config.json) and, for local development only, a token
// endpoint (/dev/login) guarded by the DevAuth flag.
package web

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/yasinaky/500/internal/auth"
	"github.com/yasinaky/500/internal/httpx"
)

//go:embed assets
var assetsFS embed.FS

// FileServer serves the embedded SPA. Unknown non-API paths fall back to
// index.html so client-side routing works.
func FileServer() http.Handler {
	sub, err := fs.Sub(assetsFS, "assets")
	if err != nil {
		panic(err) // embedded, so this can only fail at build time
	}
	fileSrv := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err != nil {
			// Not a real file: serve the SPA shell.
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		fileSrv.ServeHTTP(w, r)
	})
}

// PublicConfig is the browser-facing configuration. The anon key is a public
// client key by design; the JWT secret is never included.
type PublicConfig struct {
	SupabaseURL     string `json:"supabaseUrl"`
	SupabaseAnonKey string `json:"supabaseAnonKey"`
	DevAuth         bool   `json:"devAuth"`
}

// ConfigHandler serves the frontend config as JSON.
func ConfigHandler(cfg PublicConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, cfg)
	}
}

// DevLoginHandler mints a dev token for a chosen org/user. It is mounted only
// when DevAuth is enabled. NEVER enable DevAuth in production.
func DevLoginHandler(secret, audience string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			OrgID  string `json:"org_id"`
			UserID string `json:"user_id"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		body.OrgID = strings.TrimSpace(body.OrgID)
		if body.OrgID == "" {
			httpx.Error(w, http.StatusBadRequest, "org_id is required")
			return
		}
		if body.UserID == "" {
			body.UserID = "dev-user"
		}
		token, err := auth.Mint(secret, body.UserID, body.OrgID, audience, time.Hour)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not mint token")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"access_token": token})
	}
}
