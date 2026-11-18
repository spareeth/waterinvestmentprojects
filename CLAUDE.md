# CLAUDE.md: Water Investment Summit Secure Project Portal

Read `docs/PLAN.md` (v0.3, 18 Nov) before any work, starting with section 0 "What changed". Build order: M0 (teaser upload link) first. It holds scope, roles, architecture, data model and milestones (M0 to M10). Visual reference: `docs/mockups/`.
Source material (do not edit): the two .docx files and the meeting transcripts in `docs/sources/`.

## Context

Platform name not yet agreed ("Blue Pipeline" is a placeholder; read it from config `APP_NAME`). Phase 1: invitation-only portal for the Water Investment Summit (9 Dec 2026, UN Water Conference, Abu Dhabi).
Governments upload one-page project teasers through a per-country upload link (with one consent acknowledgement per submission); invited investors see and can download all published teasers and request bilateral meetings; country focal points accept or decline, with the WBG coordinator copied. No tiers anywhere.
Terra (Expo City Dubai) builds and hosts it. Project data belongs to the countries.

## Stack

Next.js (App Router, TypeScript strict), Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Better Auth (email + password only for now, see PLAN section 0a),
private object storage behind `src/lib/storage` (local disk now; S3-compatible/MinIO on the server), React-Leaflet, Vitest + Playwright, docker-compose for local dev.
Hosting (decided 18 Nov, for the time being): Docker Compose on Terra's Hetzner server. Azure UAE North is not used for now.
Develop in the WSL copy (`~/UNWC_ProjectPlatform`). Colour and type tokens live in `src/app/globals.css`.

## Non-negotiable rules

- Every server action, route handler and file URL goes through the single policy module (`src/lib/authz`). No permission checks inline in components.
- Default deny. Investors see only PUBLISHED projects; drafts are visible only to admins and their own country; countries never see other countries' requests; investors never see other investors' requests.
- A teaser cannot be stored without a `Submission` carrying the acknowledgement text version and timestamp. Investors cannot see the pipeline before accepting the investor acknowledgement.
- Name, URL, logos, acknowledgement texts and support email come from config, never hard-coded.
- Mockups in `docs/mockups/` are visual reference only: ignore their tier labels and old acknowledgement wording.
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
