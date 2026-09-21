-- 0002_seed.sql — local development seed data. Do NOT run in production.
-- Creates two organizations and a project each, so you can eyeball tenant
-- isolation locally.

INSERT INTO organizations (id, name) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Acme Inc'),
    ('00000000-0000-0000-0000-000000000002', 'Globex')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (org_id, name) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Acme: Website revamp'),
    ('00000000-0000-0000-0000-000000000002', 'Globex: Billing migration')
ON CONFLICT DO NOTHING;
