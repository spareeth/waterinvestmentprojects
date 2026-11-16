# Blue Pipeline: Water Investment Summit Project Portal. Build Plan

Version 0.2 | 16 November 2026 | Owner: Dr Sajid Pareeth, Terra, Expo City Dubai
Status: PROPOSED. Working name "Blue Pipeline" not yet agreed. Previous version kept as `docs/PLAN_v0.1.md`.

Sources: GCFC portal note and wireframe (6 Nov), call with Benjamin (6 Nov), Summit coordination call with
WBG/IFC, MoFA, GCFC and BCG (11 Nov), GCFC x Terra data room call (12 Nov), email thread "Investment Summit - Project Portal!!".

---

## 0. What changed since v0.1 (read this first)

1. **Content is much simpler for the Summit.** One teaser per project (WBG one-page template, PDF; some arrive as PowerPoint and are converted). 25 to max 30 teasers from 9 countries (e.g. one country has 6, one 5, one 4). No financial models, no full folder structure for the Summit (Jacob Kim, WBG, 11 Nov).
2. **Investors see the whole pipeline.** Every invited investor/operator sees all published teasers (Dan Vardi, IFC, 11 Nov). This replaces v0.1's per-project grants as the default. Per-project grants stay for optional extra material.
3. **Confidentiality acknowledgement at upload.** A country uploader must tick a box confirming the teaser contains nothing confidential and may be shared with invited participants, before publishing. Recorded in the audit log (Jacob Kim).
4. **Meeting requests.** Investors click "Request a bilateral meeting" or "Ask for more information" on a project. The country (or WBG on its behalf) accepts or declines. Optional ranking of interest.
5. **Optional slot booking.** Two physical bilateral rooms (8 Dec full day, 9 Dec morning, 30-minute slots) represented as bookable rooms in the portal, ONLY if the venue has no competing booking system (Smita to confirm). Not synced with any external room system.
6. **Optional post-bilateral material.** After a meeting, a country may share 5 to 8 extra slides with only the people it met (project-level grant). "Nice to have" (Dan Vardi).
7. **Scale:** about 9 country focal points, 100 to 200 invited investors/operators. Invitations go by email; the WBG/GCFC team curates the investor list.
8. **Branding:** single "World Bank Group" logo, not World Bank and IFC separately (Dan Vardi).
9. **Longer life (Phase 2).** GCFC wants the platform to continue beyond the Summit as a proper data room and discovery layer: UAE domestic pipelines (utilities and authorities) connected to UAE banks, ADFD and other MDB pipelines, outputs of the Compact Clinic. Full folder structure from the GCFC note returns in Phase 2, with an uploader-responsibility disclaimer. Commercial model and resourcing to be agreed separately with GCFC.
10. **Name and domain:** generic, not "compact" (Benjamin). Shortlist sent 16 Nov (as in the email), undecided: Water Investment Gateway (watergateway.org), Falaj (falajportal.org), Tadfuq (tadfuq.org), Tributary (tributary.ae), Blue Pipeline (bluepipeline.org). "Blue Pipeline" in code and mockups is a placeholder only; keep the name in one config value.
11. **Dates:** Summit 9 Dec 2026, 15:30 to 18:30. Bilaterals 8 Dec and morning of 9 Dec. Demo set for **Fri 20 Nov** (changed from Wed 18 Nov on 16 Nov).
12. **Hosting (DECIDED, 16 Nov):** Phase 1, including live operation during the Summit, runs on Terra's existing Hetzner server in Germany, as its own Docker Compose stack. Azure UAE North is no longer the Phase 1 target. Long-term hosting is part of the Phase 2 discussion.
13. **Login (DECIDED, 16 Nov):** email + password with mandatory two-step verification, as planned. Self-registration is built in but switched off; whether to open it is decided later.

---

## 1. What we are building

### Phase 1: Summit Project Portal (now to end December 2026)
An invitation-only portal where participating countries publish project teasers, invited investors and operators review the
whole pipeline and request bilateral meetings, and countries decide which meetings to accept.

### Phase 2: Blue Pipeline beyond the Summit (from January 2027, subject to agreement)
A longer-term water investment data room and pipeline discovery platform: full project data rooms with the GCFC folder
structure, other approved proponents (UAE utilities and authorities, MDB pipelines, ADFD), technical assistance needs
per project, and a later link to the Global Water Investment Atlas. Separate scoping, governance and commercial discussion.

### Out of scope for Phase 1
Financial models, full data room folders, public project directory, AI features, Atlas layers, integration with any
conference registration or matchmaking app, sync with venue room-booking systems, payments.

---

## 2. Phase 1 features

| # | Feature | Priority |
|---|---|---|
| F1 | Public landing page: Summit context, how access works, sign-in, contact, partner logos | Must |
| F2 | Invitation-based accounts, email + password + mandatory two-step verification, terms acceptance. Self-registration behind a setting, off by default; self-registered accounts wait for Summit admin approval and see nothing until approved | Must (self-registration: built, off) |
| F3 | Country workspace: add/update project, upload teaser (PDF, max 25 MB; PPTX converted to PDF after the demo), project key fields, tier, publish/unpublish | Must |
| F4 | Confidentiality acknowledgement checkbox before publishing; stored with user, time, version | Must |
| F5 | Pipeline view for investors: all published teasers, filters (country, sector, tier, PPP model, size), search; map view | Must (map: Should) |
| F6 | Teaser viewer with watermark (viewer name, organisation, time); download on/off per teaser | Must |
| F7 | Meeting request / more-information request per project, with message; optional ranking | Must |
| F8 | Country request inbox: accept / decline; email notifications to both sides; CSV export for WBG/GCFC | Must |
| F9 | Admin console (Terra + Summit team): countries, users, invitations (bulk CSV), upload on behalf, audit log, exports | Must |
| F10 | Bilateral slot booking: two rooms, 30-min slots, accepted requests get a slot, confirmation email. A country sees its own bookings in full; other countries' bookings show only as "Booked" | Should, if venue confirms no competing system |
| F11 | Post-meeting material: extra slides shared with named attendees only (project-level grant) | Could |
| F12 | View analytics for countries (who viewed their teasers) | Could, subject to agreement |

---

## 3. Roles and permissions

| Role | Who | Can |
|---|---|---|
| Platform admin | Terra | Everything technical, support, audit export |
| Summit admin | GCFC / BCG / WBG Summit team | Invite users (bulk), upload and accept/decline on behalf of a country, exports |
| Country focal point | One or two per country | Manage own country's projects, publish with acknowledgement, accept/decline requests, invite own colleagues, share extra material |
| Country member | Invited by focal point | Upload and edit drafts in own country; cannot publish or decide requests |
| Investor / operator | Invited by Summit team | View all PUBLISHED teasers, submit requests, see own requests and slots, view extra material only if granted |

Rules: default deny; countries never see or change another country's workspace, requests or slot bookings; unpublished
drafts are visible only to their country and admins; extra material requires an explicit, unexpired `ProjectGrant`;
an account pending approval sees nothing.

---

## 4. Architecture (Phase 1 on Terra's Hetzner server)

- App: Next.js (App Router, TypeScript), Tailwind + shadcn/ui, React-Leaflet, pdf.js viewer.
- DB: PostgreSQL 16 + Prisma, in its own container and volume (not shared with other services on the server).
- Auth: Better Auth (self-hosted, identities in our Postgres), email + password, 2FA mandatory. Self-registration behind `SELF_REGISTRATION_ENABLED` (default `false`). A staging-only switch may skip the second step for the demo; it must refuse to start in production.
- Files: S3-compatible object storage in a private bucket (MinIO container on the same server, or Hetzner Object Storage), behind one storage module so the backend can change later. Served only after a permission check (stream or 5-minute presigned URL). Virus scan with ClamAV before a file is visible. PPTX to PDF conversion with LibreOffice in a worker container (after the demo).
- Email: Microsoft Graph or SMTP from an ECD service mailbox, or a transactional provider with an EU data location. To decide.
- Hosting (DECIDED, 16 Nov): Terra's existing Hetzner server in Germany, as a separate Docker Compose project (own unix user, network, volumes) behind the server's reverse proxy with TLS. Deploy from GitHub Actions over SSH.
- Environments: local (WSL Docker), staging/demo (fictional data only) and production as separate stacks with separate databases and buckets. Real data only after hosting acceptance.
- Domain: to be agreed from the shortlist in section 0. Demo on a Terra subdomain or demo.<agreed-domain>. Platform name and domain must come from config (`APP_NAME`, `APP_URL`), never hard-coded.
- Security baseline: HTTPS/HSTS/CSP; encryption in transit; bucket server-side encryption and encrypted backups (Hetzner disks are not encrypted at rest by default); secrets only in a root-only `.env` on the server; host firewall and key-only SSH; daily off-host backups with a restore test; rate limiting, lockout, audit; ZAP scan before go-live.

---

## 5. Data model (v0.2)

```
Country(id, name, iso3, status)
CountryMembership(userId, countryId, role[FOCAL_POINT|MEMBER])
Project(id, countryId, name, sector, tier[TIER1|TIER2], projectType[SUMMIT_PIPELINE|OTHER_PROPONENT],
        pppModel, sizeMinUsd, sizeMaxUsd, tenderTimeline, documentsPrepared, feedbackSought,
        revenueModel, counterparty, lat, lon, status[DRAFT|PUBLISHED|WITHDRAWN], publishedAt)
Document(id, projectId, kind[TEASER|EXTRA|DATAROOM], title, filename, version, docDate, allowDownload,
         blobKey, sha256, sizeBytes, scanStatus, uploadedById, uploadedAt, supersededById)
Acknowledgement(id, projectId, documentId, userId, textVersion, acceptedAt, ip, onBehalfOfCountry, evidenceNote)
User(id, email, name, organisation, jobTitle, role[PLATFORM_ADMIN|SUMMIT_ADMIN|COUNTRY|INVESTOR],
     status[PENDING_APPROVAL|ACTIVE|DEACTIVATED], mfaEnabled, termsAcceptedAt)
Invitation(id, email, role, countryId?, tokenHash, expiresAt, acceptedAt, invitedById)
MeetingRequest(id, projectId, requesterId, type[MEETING|INFO], message, rank?, status[PENDING|ACCEPTED|DECLINED|WITHDRAWN],
               decidedById, decidedOnBehalf, decidedAt)
Room(id, name, capacity)                     // F10
Slot(id, roomId, startsAt, endsAt, status[OPEN|HELD|BOOKED], meetingRequestId?)   // F10
ProjectGrant(id, userId, projectId, scope[EXTRA], grantedById, expiresAt, revokedAt)  // F11
AuditEvent(id, actorId?, action, entityType, entityId, ip, userAgent, at, metadata)   // actorId empty for failed logins
```
`onBehalfOfCountry` and `evidenceNote` record a Summit admin acknowledging for a country (evidence: the country's email).
Phase 2 adds: Folder (00 README to 07 Q&A template), DATAROOM documents, Proponent organisations, TA needs.

---

## 6. Timeline (proposed)

| Date | Milestone |
|---|---|
| Mon 16 Nov | Outline, screenshots and questions emailed to the Summit group |
| By Thu 19 Nov | Name agreed or provisional; domain registered; staging environment live on Terra's Hetzner server |
| **Fri 20 Nov** | **Clickable demo on staging with fictional data**: landing, sign-in with 2FA, country upload with acknowledgement, pipeline view, teaser viewer, meeting request, country inbox |
| Mon 23 Nov | Responses to open questions due |
| 21 to 24 Nov | Feedback incorporated; admin console, bulk invitations, notifications, exports; security pass |
| **Wed 25 Nov** | Ready for country focal points to upload, subject to hosting acceptance and acknowledgement wording |
| **From Mon 30 Nov** | Investor invitations sent (by the Summit team or from the portal) |
| By 2 Dec | Slot booking live, if confirmed |
| 8 to 9 Dec | Bilaterals and Summit; Terra on standby support |
| To end Dec | Operation, then access expiry and close-out per agreement; Phase 2 decision |

---

## 7. Claude Code milestones (revised)

1. **M1 Scaffold** (as v0.1).
2. **M2 Data model + seed**: schema in section 5; seed with fictional Countries A to E, 8 to 10 fictional projects, sample teaser PDFs, demo users for each role.
3. **M3 Auth**: invitations, 2FA mandatory, terms acceptance, session timeout, self-registration behind `SELF_REGISTRATION_ENABLED` (off) with pending approval, staging-only 2FA switch that cannot run in production.
4. **M4 Authorisation**: single policy module; tests for: investor sees only PUBLISHED projects; country cannot see other country's drafts; extra material needs grant; requests visible only to requester, owning country and admins; other countries' slot bookings show only as "Booked"; pending accounts see nothing.
5. **M5 Country workspace**: project form with teaser fields, upload (PDF, max 25 MB; PPTX conversion after the demo), acknowledgement gate on publish (including on-behalf with evidence note), versions.
6. **M6 Pipeline + teaser viewer**: grid, filters, search, map; pdf.js viewer with watermark; download flag.
7. **M7 Requests**: request form, investor "My requests", country inbox accept/decline, email notifications, CSV export.
8. **M8 Landing + admin console**: landing page; admin users, bulk CSV invitations, on-behalf actions, audit viewer.
9. **M9 Slots (optional)**: rooms, slots, assignment for accepted requests, ICS attachment in confirmation email.
10. **M10 Infra + security pass**: Docker Compose stacks (staging, production) on Terra's Hetzner server: app, Postgres, MinIO, ClamAV, TLS via the reverse proxy, GitHub Actions deploy over SSH, off-host backups, alerts, ZAP scan, restore test. A minimal staging deploy is needed before the demo.

**Demo cut for Fri 20 Nov:** M1, M2, M3 (2FA can be skipped on staging only), M5, M6, M7 basics, landing page, minimal
staging deploy. Visual reference: `docs/mockups/` (HTML and PNG concept screens); colours and type are in `src/app/globals.css`.

---

## 8. Open questions (sent to the group on 16 Nov, see docs/EMAIL_DRAFT_16Nov.md)
Country and project list and focal points; who uploads; acknowledgement wording and owner; investor list and who sends
invitations; all-pipeline visibility confirmed; download policy; meeting request flow and ranking; rooms and booking
system; post-meeting material; hosting acceptance by countries; data controller and terms of use; retention after
December; logos and conference branding; platform name and domain owner; support contact; Phase 2 scoping.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Hosting acceptance delayed | Build and demo on staging; real uploads wait; Summit team may upload on behalf once cleared |
| Countries or WBG object to hosting in Germany | State the location in the 16 Nov email and the acknowledgement text; Summit content is shareable teasers only; app is portable (containers, S3 storage, Postgres) |
| Shared Terra server: a problem in another service reaches the portal | Own unix user, network, database and volumes; patching, firewall, off-host backups; dedicated host before Phase 2 |
| Countries slow to upload (only 3 of 9 contacts received) | Summit admin "upload on behalf" with acknowledgement captured by email and recorded |
| Slot booking conflicts with venue system | Build only after confirmation; otherwise export accepted requests for manual scheduling |
| Scope creep into matchmaking app | Keep to request / accept / slot; no integration with conference registration data |
| Phase 2 read as free extension of Phase 1 | Phase 2 scoped and resourced separately with GCFC |
