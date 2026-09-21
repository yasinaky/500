package auth

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-do-not-use-in-prod"

func sign(t *testing.T, c jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	s, err := tok.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func TestVerify_TopLevelOrgClaim(t *testing.T) {
	v := NewVerifier(testSecret, "authenticated")
	raw := sign(t, jwt.MapClaims{
		"sub":    "user-1",
		"email":  "a@example.com",
		"org_id": "org-1",
		"aud":    "authenticated",
		"exp":    time.Now().Add(time.Hour).Unix(),
	})

	id, err := v.Verify(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id.UserID != "user-1" || id.OrgID != "org-1" || id.Email != "a@example.com" {
		t.Fatalf("unexpected identity: %+v", id)
	}
}

func TestVerify_OrgInAppMetadata(t *testing.T) {
	v := NewVerifier(testSecret, "")
	raw := sign(t, jwt.MapClaims{
		"sub":          "user-2",
		"app_metadata": map[string]any{"org_id": "org-2"},
		"exp":          time.Now().Add(time.Hour).Unix(),
	})

	id, err := v.Verify(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id.OrgID != "org-2" {
		t.Fatalf("want org-2, got %q", id.OrgID)
	}
}

func TestVerify_MissingOrgRejected(t *testing.T) {
	v := NewVerifier(testSecret, "")
	raw := sign(t, jwt.MapClaims{
		"sub": "user-3",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	_, err := v.Verify(raw)
	if !errors.Is(err, ErrNoOrg) {
		t.Fatalf("want ErrNoOrg, got %v", err)
	}
}

func TestVerify_BadSignatureRejected(t *testing.T) {
	v := NewVerifier(testSecret, "")
	other := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":    "user-4",
		"org_id": "org-4",
		"exp":    time.Now().Add(time.Hour).Unix(),
	})
	raw, _ := other.SignedString([]byte("a-different-secret"))

	if _, err := v.Verify(raw); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}

func TestVerify_ExpiredRejected(t *testing.T) {
	v := NewVerifier(testSecret, "")
	raw := sign(t, jwt.MapClaims{
		"sub":    "user-5",
		"org_id": "org-5",
		"exp":    time.Now().Add(-time.Hour).Unix(),
	})

	if _, err := v.Verify(raw); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}

func TestVerify_WrongAudienceRejected(t *testing.T) {
	v := NewVerifier(testSecret, "authenticated")
	raw := sign(t, jwt.MapClaims{
		"sub":    "user-6",
		"org_id": "org-6",
		"aud":    "someone-else",
		"exp":    time.Now().Add(time.Hour).Unix(),
	})

	if _, err := v.Verify(raw); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}
