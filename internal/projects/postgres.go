package projects

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore is the production Store backed by Supabase Postgres.
// Every statement filters on org_id — tenant scoping lives at the query layer,
// not just in the UI.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore wraps a pgx pool.
func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

func (s *PostgresStore) List(ctx context.Context, orgID string) ([]Project, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, org_id, name, created_at
		   FROM projects
		  WHERE org_id = $1
		  ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Project, 0)
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *PostgresStore) Create(ctx context.Context, orgID, name string) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`INSERT INTO projects (org_id, name)
		 VALUES ($1, $2)
		 RETURNING id, org_id, name, created_at`, orgID, name).
		Scan(&p.ID, &p.OrgID, &p.Name, &p.CreatedAt)
	return p, err
}

func (s *PostgresStore) Get(ctx context.Context, orgID, id string) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`SELECT id, org_id, name, created_at
		   FROM projects
		  WHERE org_id = $1 AND id = $2`, orgID, id).
		Scan(&p.ID, &p.OrgID, &p.Name, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	return p, err
}

func (s *PostgresStore) Delete(ctx context.Context, orgID, id string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM projects WHERE org_id = $1 AND id = $2`, orgID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
