// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
)

// Config holds all runtime configuration. Everything comes from the
// environment so nothing secret ever lives in the repo (see .env.example).
type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	JWTAudience   string
}

// Load reads configuration from the environment and validates required fields.
func Load() (Config, error) {
	c := Config{
		Port:        getenv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("SUPABASE_JWT_SECRET"),
		JWTAudience: getenv("SUPABASE_JWT_AUD", "authenticated"),
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
