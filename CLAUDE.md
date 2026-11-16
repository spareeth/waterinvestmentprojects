# CLAUDE.md: Water Investment Summit Secure Project Portal

Read `docs/PLAN.md` (v0.2, 16 Nov) before any work, starting with section 0 "What changed". It holds scope, roles, architecture, data model and milestones (M1 to M10). Visual reference: `docs/mockups/`.
Source material (do not edit): the two .docx files and the meeting transcripts in `docs/sources/`.

## Context

Platform name not yet agreed ("Blue Pipeline" is a placeholder; read it from config `APP_NAME`). Phase 1: invitation-only portal for the Water Investment Summit (9 Dec 2026, UN Water Conference, Abu Dhabi).
Countries publish one-page project teasers (with a confidentiality acknowledgement); invited investors see all published teasers and request bilateral meetings; countries accept or decline. Phase 2 (later) adds full data rooms.
Terra (Expo City Dubai) builds and hosts it. Project data belongs to the countries.

## Stack

Next.js (App Router, TypeScript strict), Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Better Auth (2FA mandatory),
S3-compatible object storage (MinIO), React-Leaflet, Vitest + Playwright, docker-compose for local dev.
Phase 1 hosting: Docker Compose on Terra's existing Hetzner server (Germany). Develop in the WSL copy (`~/UNWC_ProjectPlatform`).
UI follows `docs/mockups/`; colour and type tokens live in `src/app/globals.css`.

## Non-negotiable rules

- Every server action, route handler and file URL goes through the single policy module (`src/lib/authz`). No permission checks inline in components.
- Default deny. Investors see only PUBLISHED projects; drafts stay within their country; extra material needs an explicit, unexpired `ProjectGrant`.
- Publishing a project is impossible without a stored `Acknowledgement`.
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
