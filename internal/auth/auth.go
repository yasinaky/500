// Package auth verifies Supabase-issued access tokens and exposes the
// authenticated identity (user + tenant/org) to downstream handlers.
//
// Supabase signs access tokens with HS256 using the project's JWT secret.
// We verify the signature, standard claims, and require an org_id so that
// every request is scoped to exactly one tenant.
package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"github.com/yasinaky/500/internal/httpx"
)

// Identity is the authenticated caller derived from a verified token.
type Identity struct {
	UserID string // Supabase "sub" claim
	OrgID  string // tenant id; the app enforces isolation on this
	Email  string
}

type ctxKey struct{}

// claims mirrors the subset of a Supabase access token we care about.
// org_id may be set as a top-level custom claim or nested under app_metadata.
type claims struct {
	Email       string `json:"email"`
	OrgID       string `json:"org_id"`
	AppMetadata struct {
		OrgID string `json:"org_id"`
	} `json:"app_metadata"`
	jwt.RegisteredClaims
}

func (c claims) orgID() string {
	if c.OrgID != "" {
		return c.OrgID
	}
	return c.AppMetadata.OrgID
}

var (
	// ErrNoToken is returned when the Authorization header is missing/malformed.
	ErrNoToken = errors.New("missing bearer token")
	// ErrInvalidToken is returned when a token fails verification.
	ErrInvalidToken = errors.New("invalid token")
	// ErrNoOrg is returned when a valid token carries no tenant id.
	ErrNoOrg = errors.New("token has no org_id claim")
)

// Verifier verifies tokens using a shared secret and expected audience.
type Verifier struct {
	secret   []byte
	audience string
}

// NewVerifier builds a Verifier. audience may be empty to skip the check.
func NewVerifier(secret, audience string) *Verifier {
	return &Verifier{secret: []byte(secret), audience: audience}
}

// Verify parses and validates a raw JWT string, returning the Identity.
func (v *Verifier) Verify(raw string) (Identity, error) {
	opts := []jwt.ParserOption{jwt.WithValidMethods([]string{"HS256"})}
	if v.audience != "" {
		opts = append(opts, jwt.WithAudience(v.audience))
	}

	var c claims
	_, err := jwt.ParseWithClaims(raw, &c, func(t *jwt.Token) (any, error) {
		return v.secret, nil
	}, opts...)
	if err != nil {
		return Identity{}, ErrInvalidToken
	}
	if c.Subject == "" {
		return Identity{}, ErrInvalidToken
	}
	org := c.orgID()
	if org == "" {
		return Identity{}, ErrNoOrg
	}
	return Identity{UserID: c.Subject, OrgID: org, Email: c.Email}, nil
}

// Middleware verifies the Authorization header and injects the Identity into
// the request context. Requests without a valid, org-scoped token are rejected.
func (v *Verifier) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, err := bearerToken(r)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "missing or malformed Authorization header")
			return
		}
		id, err := v.Verify(raw)
		switch {
		case errors.Is(err, ErrNoOrg):
			httpx.Error(w, http.StatusForbidden, "token is not associated with an organization")
			return
		case err != nil:
			httpx.Error(w, http.StatusUnauthorized, "invalid token")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
	})
}

// FromContext returns the Identity set by Middleware, if present.
func FromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(ctxKey{}).(Identity)
	return id, ok
}

// WithIdentity returns a context carrying id. Middleware uses it in production;
// tests use it to exercise handlers without minting real tokens.
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

func bearerToken(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", ErrNoToken
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", ErrNoToken
	}
	return strings.TrimSpace(parts[1]), nil
}
