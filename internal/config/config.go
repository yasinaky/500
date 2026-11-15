// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
)

// Config holds all runtime configuration. Everything comes from the
// environment so nothing secret ever lives in the repo (see .env.example).
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	JWTAudience string

	// Frontend config, served to the browser at /config.json. The anon key is
	// a public client key by design, so it is safe to expose; the JWT secret
	// above never leaves the server.
	SupabaseURL     string
	SupabaseAnonKey string

	// DevAuth enables the /dev/login endpoint, which mints tokens without a
	// real Supabase sign-in. For local development ONLY — never enable it in
	// production.
	DevAuth bool
}

// Load reads configuration from the environment and validates required fields.
func Load() (Config, error) {
	c := Config{
		Port:            getenv("PORT", "8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		JWTSecret:       os.Getenv("SUPABASE_JWT_SECRET"),
		JWTAudience:     getenv("SUPABASE_JWT_AUD", "authenticated"),
		SupabaseURL:     os.Getenv("SUPABASE_URL"),
		SupabaseAnonKey: os.Getenv("SUPABASE_ANON_KEY"),
		DevAuth:         os.Getenv("DEV_AUTH") == "true",
	}

	var missing []string
	if c.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if c.JWTSecret == "" {
		missing = append(missing, "SUPABASE_JWT_SECRET")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required env vars: %v (see .env.example)", missing)
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
