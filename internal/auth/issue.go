package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Mint signs an HS256 access token with the same shape Supabase issues, for
// LOCAL development only. The backend accepts it because it is signed with the
// same SUPABASE_JWT_SECRET. It is exposed in production only if DEV_AUTH is on,
// which must never be the case in a real deployment.
func Mint(secret, userID, orgID, audience string, ttl time.Duration) (string, error) {
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":    userID,
		"org_id": orgID,
		"email":  userID + "@example.com",
		"aud":    audience,
		"iat":    now.Unix(),
		"exp":    now.Add(ttl).Unix(),
	})
	return tok.SignedString([]byte(secret))
}
