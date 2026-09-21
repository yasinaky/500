# 500 — multi-tenant SaaS backend (Go + Supabase)

A production-shaped starting point for a SaaS backend: a Go HTTP API with
Supabase Auth (JWT) and Supabase Postgres, multi-tenant via a shared database
with a tenant column (`org_id`). It ships one real, tenant-scoped vertical slice
— **projects** — as the reference pattern to copy.

Scaffolded with the `saas-starter` skill (thin vertical slice, runnable at
every step, tenancy and secrets handled on day one).

## Stack & decisions

| Concern     | Choice                                          |
|-------------|-------------------------------------------------|
| Language    | Go 1.24 (stdlib `net/http` routing)             |
| Auth        | Supabase Auth — backend verifies HS256 JWTs     |
| Database    | Supabase Postgres (via `pgx`)                   |
| Tenancy     | Shared DB, `org_id` column, filtered on every query |
| Migrations  | Plain SQL in `migrations/`                       |

## Run it locally (under 10 minutes)

Prerequisites: Go 1.24+, and a Postgres you can reach. The quickest path is a
free Supabase project; any Postgres works for the API itself.

1. **Configure.**
   ```bash
   cp .env.example .env
   # Fill in DATABASE_URL and SUPABASE_JWT_SECRET (Supabase → Project Settings).
   set -a && source .env && set +a
   ```

2. **Apply the schema** (and optional local seed data):
   ```bash
   make migrate
   make seed     # optional: two demo orgs + a project each
   ```

3. **Run the server:**
   ```bash
   make run
   # {"level":"INFO","msg":"listening","addr":":8080"}
   ```

4. **Call the API.** Mint a local token (dev only) and hit the protected routes:
   ```bash
   TOKEN=$(make -s dev-token ORG=org-1 USER=user-1)

   curl -s localhost:8080/healthz

   curl -s -X POST localhost:8080/api/projects \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"name":"Apollo"}'

   curl -s localhost:8080/api/projects -H "Authorization: Bearer $TOKEN"
   ```

> The `dev-token` helper signs with your `SUPABASE_JWT_SECRET` for local
> testing. In production, tokens come from Supabase Auth after a real sign-in.

## API

All `/api/*` routes require `Authorization: Bearer <supabase-access-token>`.
The token must carry an `org_id` (top-level claim or under `app_metadata`);
requests without one get `403`.

| Method | Path                 | Description                       |
|--------|----------------------|-----------------------------------|
| GET    | `/healthz`           | Liveness (public)                 |
| GET    | `/api/projects`      | List projects in the caller's org |
| POST   | `/api/projects`      | Create a project (`{"name":...}`) |
| GET    | `/api/projects/{id}` | Get one (404 if not in your org)  |
| DELETE | `/api/projects/{id}` | Delete one (404 if not in your org) |

## How tenancy is enforced

- Auth middleware (`internal/auth`) verifies the JWT and extracts `org_id`.
- Every store method takes `orgID` and filters by it (`internal/projects`).
  Cross-tenant access returns `404`, never another org's data.
- `internal/projects/handler_test.go` (`TestTenantIsolation`) is the
  load-bearing test that proves org-2 cannot see or reach org-1's rows.
- For defense in depth on Supabase, enable Postgres Row Level Security — see
  the commented policy in `migrations/0001_init.sql`.

## Layout

```
cmd/server      HTTP entrypoint (config, DB pool, graceful shutdown)
cmd/devtoken    local-only JWT minting helper
internal/config env-based configuration
internal/auth   Supabase JWT verification + middleware
internal/httpx  small JSON/error helpers
internal/projects  the reference tenant-scoped resource
internal/server routing + middleware wiring
migrations      SQL schema and seed
```

## Development

```bash
make test     # go test ./...   (includes tenant-isolation)
make vet      # go vet ./...
make build    # -> bin/server
```

CI (`.github/workflows/ci.yml`) runs tidy-check, vet, build, and `test -race`
on every push and PR.

## Conventions

- **Add a new resource** by copying `internal/projects`: a `Store` interface,
  a `PostgresStore` that filters by `org_id`, a `Handler`, and a test that
  proves tenant isolation. Register its routes in `internal/server`.
- **Never** query a tenant-owned table without an `org_id` filter.
- **Never** commit secrets. Add new config to `internal/config` and document
  it in `.env.example`.
