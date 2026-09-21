package projects

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yasinaky/500/internal/auth"
)

// memStore is an in-memory Store for tests. It mirrors the org-scoping
// contract of the real Postgres store.
type memStore struct {
	mu   sync.Mutex
	seq  int
	rows []Project
}

func (m *memStore) List(_ context.Context, orgID string) ([]Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Project, 0)
	for _, p := range m.rows {
		if p.OrgID == orgID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (m *memStore) Create(_ context.Context, orgID, name string) (Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.seq++
	p := Project{
		ID:        string(rune('a'-1+m.seq)) + "-id",
		OrgID:     orgID,
		Name:      name,
		CreatedAt: time.Now(),
	}
	m.rows = append(m.rows, p)
	return p, nil
}

func (m *memStore) Get(_ context.Context, orgID, id string) (Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, p := range m.rows {
		if p.OrgID == orgID && p.ID == id {
			return p, nil
		}
	}
	return Project{}, ErrNotFound
}

func (m *memStore) Delete(_ context.Context, orgID, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, p := range m.rows {
		if p.OrgID == orgID && p.ID == id {
			m.rows = append(m.rows[:i], m.rows[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func newServer(store Store) http.Handler {
	mux := http.NewServeMux()
	NewHandler(store).Routes(mux)
	return mux
}

// asOrg wraps a request with an authenticated identity for the given org.
func asOrg(r *http.Request, org string) *http.Request {
	id := auth.Identity{UserID: "u-" + org, OrgID: org, Email: org + "@example.com"}
	return r.WithContext(auth.WithIdentity(r.Context(), id))
}

func TestCreateAndList(t *testing.T) {
	srv := newServer(&memStore{})

	// Create as org-1.
	req := asOrg(httptest.NewRequest("POST", "/api/projects",
		strings.NewReader(`{"name":"Apollo"}`)), "org-1")
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: want 201, got %d (%s)", rec.Code, rec.Body)
	}

	// List as org-1 returns it.
	req = asOrg(httptest.NewRequest("GET", "/api/projects", nil), "org-1")
	rec = httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	var listResp struct {
		Projects []Project `json:"projects"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(listResp.Projects) != 1 || listResp.Projects[0].Name != "Apollo" {
		t.Fatalf("unexpected list: %+v", listResp.Projects)
	}
}

// TestTenantIsolation is the load-bearing test: org-2 must never see or reach
// org-1's data.
func TestTenantIsolation(t *testing.T) {
	store := &memStore{}
	srv := newServer(store)

	// org-1 creates a project.
	req := asOrg(httptest.NewRequest("POST", "/api/projects",
		strings.NewReader(`{"name":"Secret"}`)), "org-1")
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	var created Project
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create: %v", err)
	}

	// org-2 lists: must be empty.
	req = asOrg(httptest.NewRequest("GET", "/api/projects", nil), "org-2")
	rec = httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	var listResp struct {
		Projects []Project `json:"projects"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &listResp)
	if len(listResp.Projects) != 0 {
		t.Fatalf("tenant leak: org-2 saw %d projects", len(listResp.Projects))
	}

	// org-2 tries to GET org-1's project by id: must be 404, not 200.
	req = asOrg(httptest.NewRequest("GET", "/api/projects/"+created.ID, nil), "org-2")
	rec = httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("tenant leak: org-2 GET org-1 project => %d, want 404", rec.Code)
	}

	// org-2 tries to DELETE org-1's project: must be 404 and leave it intact.
	req = asOrg(httptest.NewRequest("DELETE", "/api/projects/"+created.ID, nil), "org-2")
	rec = httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("tenant leak: org-2 DELETE org-1 project => %d, want 404", rec.Code)
	}
	if _, err := store.Get(context.Background(), "org-1", created.ID); err != nil {
		t.Fatalf("org-1 project should still exist, got %v", err)
	}
}

func TestCreateValidation(t *testing.T) {
	srv := newServer(&memStore{})
	req := asOrg(httptest.NewRequest("POST", "/api/projects",
		strings.NewReader(`{"name":"   "}`)), "org-1")
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("blank name: want 400, got %d", rec.Code)
	}
}

func TestUnauthenticatedRejected(t *testing.T) {
	srv := newServer(&memStore{})
	// No identity in context.
	req := httptest.NewRequest("GET", "/api/projects", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}
