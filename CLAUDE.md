# CLAUDE.md: Water Investment Summit Secure Project Portal

Read `docs/PLAN.md` before any work. It holds scope, roles, architecture, data model and the milestone list (M1 to M10).
Source material (do not edit): `UNWC Investment Summit catch up.docx` (6 Nov call transcript),
`water-investment-summit-portal-note.docx` (GCFC requirements note).

## Context

Invitation-only data room for the Water Investment Summit (9 Dec 2026, UN Water Conference, Abu Dhabi).
Countries upload project teasers (and, where they choose, fuller documents); approved investors view them and request
bilateral meetings. Terra (Expo City Dubai) builds and hosts it. Project data belongs to the countries.

## Stack

Next.js (App Router, TypeScript strict), Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Better Auth (2FA mandatory),
S3-compatible object storage (MinIO), React-Leaflet, Vitest + Playwright, docker-compose for local dev.
Pilot hosting: Docker Compose on Terra's existing Hetzner server (Germany). Develop in the WSL copy (`~/UNWC_ProjectPlatform`).

## Non-negotiable rules

- Every server action, route handler and file URL goes through the single policy module (`src/lib/authz`). No permission checks inline in components.
- Default deny. An investor sees a project only with an explicit, unexpired, unrevoked `ProjectGrant`, and only the folders its access level allows (TEASER or FULL).
- Every upload records the uploader's confidentiality acknowledgement (text version, user, time).
- Files are never public. Serve via permission check, then short-lived signed URL (max 5 min) or stream.
- Every create, update, delete, grant, revoke, login, view and download writes an `AuditEvent`.
- No real country data in local or staging. Seed data only, clearly fictional names.
- No secrets in the repo. `.env.example` lists variables; real values live only on the server, in a root-only `.env`.
- Add or update a test proving cross-country and cross-project isolation whenever authz-related code changes.

## Working style

- One milestone per session. Plan first, then implement, then run `npm run lint && npm test`.
- Keep the names in the PLAN data model exactly; ask before renaming or restructuring.
- When finished, list exactly which files changed.
- British spelling in UI text. No em dashes in UI copy.
