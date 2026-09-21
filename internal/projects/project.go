// Package projects is the reference vertical slice: a tenant-scoped resource
// that goes UI/API -> store -> DB and back. Every store method takes an orgID
// and MUST filter by it, so one tenant can never read or mutate another's data.
package projects

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound is returned when no project matches the id within the org.
// It is deliberately returned for "belongs to another org" too, so callers
// cannot distinguish "missing" from "not yours".
var ErrNotFound = errors.New("project not found")

// Project is a single tenant-owned record.
type Project struct {
	ID        string    `json:"id"`
	OrgID     string    `json:"org_id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// Store is the persistence contract. Implementations MUST scope every query
// by orgID. The interface lets handlers be tested without a live database.
type Store interface {
	List(ctx context.Context, orgID string) ([]Project, error)
	Create(ctx context.Context, orgID, name string) (Project, error)
	Get(ctx context.Context, orgID, id string) (Project, error)
	Delete(ctx context.Context, orgID, id string) error
}
