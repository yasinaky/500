---
name: saas-starter
description: >-
  Scaffold and harden a new web/SaaS product from zero to a runnable,
  production-shaped baseline. Use when the user starts a new SaaS or web app,
  asks to "bootstrap / scaffold / kick off" a project, or wants a repeatable
  first-day setup covering auth, multi-tenancy, billing, database, CI/CD and
  observability. Inspired by an AI-native, product-first delivery style:
  ship a thin vertical slice that actually runs, not a pile of TODOs.
---

# SaaS Starter

A repeatable workflow for standing up a new web/SaaS product so that day one
ends with something that **runs, deploys, and is safe to build on** — not a
scaffold full of placeholders.

## When to use this

- The user is starting a new SaaS or web application from scratch.
- They ask to bootstrap, scaffold, or "set up the skeleton" of a project.
- They want the standard cross-cutting concerns (auth, billing, tenancy,
  CI/CD) wired in a sensible default way instead of deciding each from zero.

Do **not** use this for adding a feature to an existing, established codebase —
follow that repo's own conventions instead.

## Operating principles

1. **Thin vertical slice first.** One real feature that goes end to end
   (UI → API → DB → back) beats ten half-wired subsystems. Prove the stack
   works before widening it.
2. **Runnable at every step.** After each phase the app must start and its
   checks must pass. Never leave the tree red.
3. **Ask before assuming the big forks.** Language/framework, database, auth
   provider, and hosting target change everything downstream — confirm these
   before generating code. Everything smaller, pick a sane default and state it.
4. **Security and multi-tenancy are day-one, not day-ninety.** Tenant
   isolation, secret handling, and input validation are far cheaper to bake in
   now than to retrofit.
5. **Leave a paved road.** A README that a new engineer can follow to run the
   app in under 10 minutes is part of "done".

## Workflow

### Phase 0 — Decide the forks (ask, don't guess)

Confirm with the user before writing code:
- **Stack:** language + framework (e.g. TypeScript + Next.js, Python + Django,
  Go + …). If they have no preference, recommend one and say why.
- **Database:** Postgres is the default recommendation for SaaS; confirm.
- **Auth:** managed (Clerk/Auth0/Supabase Auth) vs. rolled-in. Default to
  managed for speed unless there's a reason not to.
- **Tenancy model:** single-tenant, shared-DB-with-tenant-column, or DB-per-tenant.
- **Hosting/CI target:** where it deploys (Vercel, Fly, AWS, container, …).

State each chosen default in one line so the user can veto it.

### Phase 1 — Skeleton that runs

- Initialize the project with the framework's official tooling.
- Set up dependency management, formatter, linter, and typechecker.
- Add a `.env.example` (never real secrets) and load config from env.
- Confirm: `install → build → start` works and the home page renders.

### Phase 2 — Data + tenancy

- Wire the database with a migration tool (never hand-edited schema).
- Model the tenant/organization and user tables with the isolation approach
  chosen in Phase 0. Enforce tenant scoping at the query layer, not just the UI.
- Seed script for local dev data.

### Phase 3 — Auth + a vertical slice

- Integrate the chosen auth so sign-up / sign-in / sign-out work.
- Build ONE real, tenant-scoped feature end to end as the reference pattern
  (e.g. a "projects" list the signed-in user can create and see only theirs).
- Add at least one test that exercises that slice.

### Phase 4 — Billing hook (if SaaS is paid)

- Wire the payment provider (Stripe is the common default) far enough to have a
  plan, a checkout entry point, and a webhook that updates subscription state.
- Gate one feature behind plan/entitlement to prove the enforcement path.

### Phase 5 — CI/CD + observability

- CI that runs lint + typecheck + tests on every push.
- A deploy path to the Phase 0 target (even if just a preview environment).
- Basic logging and error reporting wired (structured logs; an error tracker
  if the user uses one).

### Phase 6 — Paved road

- README: what it is, how to run locally, env vars, how to deploy, where the
  reference feature lives.
- A short "conventions" note so future work stays consistent.

## Checklist (definition of done for the baseline)

- [ ] `install → build → start` works from a clean clone.
- [ ] Lint, typecheck, and tests pass in CI.
- [ ] Sign-up / sign-in works; sessions persist.
- [ ] One tenant-scoped feature works end to end, with a test.
- [ ] Tenant A cannot read Tenant B's data (verify, don't assume).
- [ ] No secrets in the repo; `.env.example` documents every required var.
- [ ] README lets a new dev run it in under 10 minutes.

## Guardrails

- Never commit real secrets, API keys, or `.env` files. Add them to
  `.gitignore` and document them in `.env.example`.
- Never disable auth or tenant checks "temporarily" to make something work.
- Prefer the framework's and libraries' official, current patterns over
  bespoke plumbing.
- If a fork from Phase 0 is still unanswered, stop and ask rather than picking
  silently — these are expensive to reverse.
