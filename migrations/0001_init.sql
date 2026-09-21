-- 0001_init.sql — initial schema for the multi-tenant projects slice.
--
-- Tenancy model: shared database, tenant column (org_id) on every tenant-owned
-- row. Application code filters by org_id on every query. If you run this on
-- Supabase you can additionally enable Row Level Security (see the commented
-- block at the bottom) to enforce isolation in the database itself.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- Organizations are the tenants.
CREATE TABLE IF NOT EXISTS organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership links Supabase auth users (auth.users.id) to an organization.
CREATE TABLE IF NOT EXISTS memberships (
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    role       TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

-- The reference tenant-scoped resource.
CREATE TABLE IF NOT EXISTS projects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-scoped lookups hit this index.
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects (org_id);

-- Optional but recommended on Supabase: defense in depth via RLS. The app
-- already scopes by org_id; RLS makes the database reject cross-tenant reads
-- even if a query forgets the filter. Requires the JWT to carry org_id.
--
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY projects_tenant_isolation ON projects
--   USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
