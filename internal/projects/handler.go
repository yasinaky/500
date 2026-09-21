package projects

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/yasinaky/500/internal/auth"
	"github.com/yasinaky/500/internal/httpx"
)

// Handler exposes the projects resource over HTTP. It relies on auth.Middleware
// having populated the request context with an Identity.
type Handler struct {
	store Store
}

// NewHandler builds a projects Handler.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Routes registers the projects endpoints on a ServeMux (Go 1.22+ patterns).
func (h *Handler) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/projects", h.list)
	mux.HandleFunc("POST /api/projects", h.create)
	mux.HandleFunc("GET /api/projects/{id}", h.get)
	mux.HandleFunc("DELETE /api/projects/{id}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.FromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	items, err := h.store.List(r.Context(), id.OrgID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not list projects")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"projects": items})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.FromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	p, err := h.store.Create(r.Context(), id.OrgID, body.Name)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create project")
		return
	}
	httpx.JSON(w, http.StatusCreated, p)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.FromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	p, err := h.store.Get(r.Context(), id.OrgID, r.PathValue("id"))
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "project not found")
		return
	case err != nil:
		httpx.Error(w, http.StatusInternalServerError, "could not fetch project")
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.FromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	err := h.store.Delete(r.Context(), id.OrgID, r.PathValue("id"))
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "project not found")
		return
	case err != nil:
		httpx.Error(w, http.StatusInternalServerError, "could not delete project")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
