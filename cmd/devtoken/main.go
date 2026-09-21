// Command devtoken mints a short-lived HS256 token for LOCAL testing only.
//
// It lets you exercise the protected API without wiring up a full Supabase
// sign-in. It signs with SUPABASE_JWT_SECRET, so the token is only accepted by
// a backend configured with the same secret. Never use this in production.
//
// Usage:
//
//	SUPABASE_JWT_SECRET=xxx go run ./cmd/devtoken -org org-1 -user u-1
package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func main() {
	org := flag.String("org", "org-1", "org_id claim (tenant)")
	user := flag.String("user", "user-1", "sub claim (user id)")
	aud := flag.String("aud", "authenticated", "aud claim")
	ttl := flag.Duration("ttl", time.Hour, "token lifetime")
	flag.Parse()

	secret := os.Getenv("SUPABASE_JWT_SECRET")
	if secret == "" {
		fmt.Fprintln(os.Stderr, "SUPABASE_JWT_SECRET is required")
		os.Exit(1)
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":    *user,
		"org_id": *org,
		"email":  *user + "@example.com",
		"aud":    *aud,
		"iat":    time.Now().Unix(),
		"exp":    time.Now().Add(*ttl).Unix(),
	})
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		fmt.Fprintln(os.Stderr, "sign:", err)
		os.Exit(1)
	}
	fmt.Println(s)
}
