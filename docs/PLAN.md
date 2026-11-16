# Water Investment Summit Secure Project Portal: Build Plan

Version 0.2 | 16 November 2026 | Owner: Dr Sajid Pareeth, Terra, Expo City Dubai
Status: PROPOSED, updated after the 11 Nov WBG/BCG coordination call and the 12 Nov GCFC call.
Items marked **DECIDED** were confirmed by the owner; everything else is still a proposal.

Sources reviewed: Benjamin Bartle's portal note (6 Nov), the 6 Nov call transcript, the ChatGPT wireframe
(water-investment-summit-wireframe-ben.benjibartle.chatgpt.site), the email thread "Investment Summit - Project Portal!!" (4 to 7 Nov),
the "UAE Water Investment Summit" coordination call (11 Nov: WBG, BCG, Summit organisers, Terra) and the
"GCFC x Terra Data Room Discussion" (12 Nov).

### What changed in v0.2

- **Content for the Summit is simple**: one teaser per project (WBG one-page template, PDF), 25 to max 30 in total. No financial models or feasibility studies are requested from countries for the Summit.
- **Investors see all Summit projects**: every approved investor sees every Summit-listed teaser and then asks for a bilateral meeting. Per-project approval stays for anything beyond the teaser.
- **Countries acknowledge at upload**: a mandatory click acknowledgement, recorded per document. Its text is to be supplied by WBG (Summit) and GCFC (longer term).
- **Meeting requests are core**: investors request a bilateral meeting per project, countries accept or decline. Room slot booking is optional, only if the venue has no booking system of its own.
- **Longer life**: GCFC wants the platform to continue after the Summit as a proper data room for UAE and international pipelines, with the full folder structure kept.
- **Hosting (DECIDED, 16 Nov)**: the pilot, including live operation during the Summit, runs on Terra's existing Hetzner server (Germany). Azure UAE North is no longer the v1 target.
- **Login (DECIDED, 16 Nov)**: as planned, Better Auth with email + password and mandatory 2FA. Self-registration is built in but switched off until it is decided.

---

## 1. What we are building

A secure, invitation-only project portal for the Water Investment Summit (9 December 2026, 15:30 to 18:30, UN Water Conference, Abu Dhabi)
with two purposes:

1. **Country acknowledgement**: governments upload their project teasers themselves and confirm, in the portal, that the content may be shared with invited participants.
2. **Controlled access**: only invited, approved people see the projects, and investors use the portal to request bilateral meetings with countries.

- Scale (Summit): 9 countries, 25 to max 30 project teasers (for example Egypt 6, Jordan 5, Angola 4), 100 to 200 invited investors and operators. As of 11 Nov, WBG had contacts for 3 of the 9 countries and teasers were ready for all countries except Egypt.
- Bilaterals: two rooms (20-person and 10-person) held for 8 December and the morning of 9 December, pending sponsor confirmation by the organisers.
- Life: pilot through the Summit, then intended to continue as a longer-term platform with GCFC (see section 1.2). The longer-term phase needs its own agreement on hosting, funding and commercial model.
- Data belongs to the countries (and, later, to other project proponents).
- Positioned within the Global Water Investment Atlas framing, but built and launched independently of the Atlas architecture.

### 1.1 Summit track (v1)

Countries upload one teaser per project. Approved investors browse all Summit projects, view the teasers and request
bilateral meetings. Countries review requests, can rank them, and accept or decline. Scheduling after acceptance can be manual.
Optional extra from the WBG/IFC side: after a bilateral, the country uploads a short follow-up deck (5 to 6 slides, no models)
visible only to the people who attended that meeting.

### 1.2 Longer-term track (after the Summit, with GCFC)

A discovery and aggregation platform, not a tendering platform. Proposed users:

- UAE utilities and authorities with project pipelines, sharing them with UAE banks.
- UAE banks with blue and water pledges, looking for international pipeline.
- DFIs such as ADFD, choosing projects that fit their priorities.

The full data room structure (folders 01 to 07) stays available, so proponents can upload more than a teaser if they choose.
Tendering and applications stay outside the portal.

### Out of scope for v1

Public project directory, AI features, Atlas data layers, Q&A threads inside the portal, e-signature, payments, full
matchmaking with two-way ranking algorithms, synchronisation with any external room booking or conference app, and
non-country proponents (utilities, ADFD, banks; these come in the longer-term track through `projectType`).

---

## 2. What the wireframe gets right, and what changes in a real build

| Wireframe / note / calls                                            | Build decision                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public landing, no project catalogue                                | Keep. Static page, bilingual-ready (EN first). Project names are not public.                                                                                                                                     |
| Email + password + second step                                      | Keep (DECIDED). MFA mandatory for every user (TOTP app or email one-time code). No shared or country-wide passwords anywhere: every person gets a personal login.                                                 |
| Investor sees only approved project rooms                           | **Changed.** Approved investors see the teaser of every Summit-listed project (TEASER access). Anything beyond the teaser needs a per-project FULL grant from the country.                                         |
| Country focal point invites colleagues and approves external access | Keep, plus an admin "on behalf of" route: the GCFC/BCG/WBG team can upload and record approvals when a country prefers not to log in. Every action records who approved.                                         |
| Standard folders 01 to 07 + START HERE                              | Keep the full template (GCFC). For Summit projects the teaser is the only required document. Empty folders show "Not yet provided" to FULL-access users.                                                          |
| Expression of interest (EOI) route                                  | **Becomes "Request a bilateral meeting"** on each project. Countries see who asked, can rank, accept or decline. Organisers can export all requests.                                                             |
| Confidentiality                                                     | **New.** Mandatory click acknowledgement at upload, stored per document with the text version. Text differs by track (WBG: "contains nothing confidential"; GCFC: "may be commercially sensitive, your choice"). |
| Expiry, revocation, audit trail                                     | Keep. Grants carry an expiry date (default: 31 Jan 2027). Full activity log exportable as CSV.                                                                                                                   |
| Interactive map (raised on the call)                                | Inside the secure area only: map of the projects the user can see. Low priority for the Summit.                                                                                                                  |
| Meeting room slots (11 Nov call)                                    | **Optional.** Two named rooms with 30-minute slots that an accepted meeting can book, only if the organisers confirm there is no other booking system for those rooms.                                          |
| Self-registration (16 Nov)                                          | **Built, off by default.** When switched on, new accounts wait for approval and see nothing until a content admin approves them.                                                                                 |

Added for a live service: dynamic watermark (viewer name, email, timestamp) on PDF view and download; per-document
"view only" flag; virus scanning on upload; file versioning; terms-of-use click-through at first login; data export per
country at close-out. Branding: "World Bank Group" as the single WBG logo (not WB and IFC separately).

---

## 3. Roles and permissions

| Role                | Who                                     | Can                                                                                                                                                       |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform admin      | Terra technical team                    | Everything, incl. user support, audit export. Cannot be the content approver of record.                                                                   |
| Content admin       | GCFC / BCG / WBG Summit team            | Create countries and projects, approve investor accounts, upload on behalf of countries, record approvals with evidence, export meeting requests and audit. |
| Country focal point | Nominated per country                   | Manage own country's projects and files, invite colleagues, review and accept or decline meeting requests, grant or revoke FULL access per project.       |
| Country member      | Invited by focal point                  | Upload and update files in own country's projects (with acknowledgement). No access decisions.                                                            |
| Investor / operator | Invited by organisers (curated list)    | View teasers of all Summit-listed projects once approved; FULL access only where granted; request bilateral meetings.                                     |

Rules:

- No role sees another country's workspace except admins.
- Default deny still applies: an investor sees a project only through an explicit, unexpired, unrevoked `ProjectGrant`. For Summit-listed projects, TEASER grants are created automatically when an investor is approved and when a project is listed.
- An account that is pending approval (self-registration) has no grants and sees nothing.

---

## 4. Architecture (pilot on Terra's Hetzner server)

**Hosting (DECIDED, 16 Nov)**: the pilot and live Summit operation run on Terra's existing Hetzner server in Germany.
Reason: speed, and the Summit content is one-page teasers that countries acknowledge as shareable. The app stays
portable (containers, S3-compatible storage, plain PostgreSQL) so it can move to a dedicated or UAE host for the longer-term track.

- **App**: Next.js (App Router, TypeScript), Tailwind + shadcn/ui, React-Leaflet for the map.
- **Database**: PostgreSQL 16 with Prisma ORM, in its own container and volume (not shared with other services on the server).
- **Auth** (DECIDED): Better Auth (self-hosted, identities stored in our Postgres) with email + password, mandatory 2FA (TOTP / email OTP), invitation tokens, 30-minute idle timeout. Self-registration behind a setting (`SELF_REGISTRATION_ENABLED`, default `false`); self-registered accounts start as pending approval.
- **File storage**: S3-compatible object storage in a private bucket: a MinIO container on the same server, or Hetzner Object Storage. Files never public; served after a permission check through presigned URLs (max 5 min) or streamed. Storage sits behind one module (`src/lib/storage`) so the backend can change later.
- **Malware scan**: ClamAV container; a document becomes visible only after a clean scan.
- **Email**: SMTP or Microsoft Graph from an ECD service mailbox, or a transactional provider with an EU data location. To decide.
- **Hosting layout**: a dedicated Docker Compose project on the existing server (app, Postgres, MinIO, ClamAV) behind the server's reverse proxy with TLS. Own unix user, Docker network and volumes, separate from the other services on the host.
- **Deployment**: GitHub Actions builds the container image, pushes it to GitHub Container Registry and deploys over SSH. Needs a GitHub repository and a deploy key.
- **Environments**: local (WSL Docker), staging (dummy data only) and production as separate compose stacks with separate databases and buckets.
- **Domain**: a generic name, not tied to "water compact" (Benjamin, 12 Nov), so it can serve the longer-term track. Owner to agree.

Security baseline: HTTPS only, HSTS, CSP; encryption in transit; server-side encryption on the bucket and encrypted
backups (Hetzner disks are not encrypted at rest by default); secrets in a root-only `.env` on the server, never in the
repo; host firewall (80/443 and key-only SSH); daily DB and bucket backups off the host (Hetzner Storage Box, 35-day
retention) with a restore test; rate limiting on auth; lockout after failed attempts; all authorisation in server code
with automated tests; OWASP ZAP scan before real uploads.

---

## 5. Data model

### 5.1 First cut (v0.1, unchanged)

```
Country(id, name, iso3, focalPointUserId)
Project(id, countryId, name, shortDescription, tier[TIER1|TIER2], projectType[COUNTRY_PIPELINE|OTHER_PROPONENT],
        sector, location(lat,lon), focalPointEmail, status)
Folder(id, projectId, code[00_README..07_QA], title)            // created from template on project creation
Document(id, folderId, filename, title, docDate, version, viewOnly, blobKey, sha256, sizeBytes,
         scanStatus, uploadedById, uploadedAt, supersededById)
User(id, email, name, organisation, role, mfaEnabled, termsAcceptedAt, status)
CountryMembership(userId, countryId, role[FOCAL_POINT|MEMBER])
ProjectGrant(id, userId, projectId, grantedById, grantedOnBehalfOf, evidenceNote, expiresAt, revokedAt)
AccessRequest(id, requesterEmail, organisation, projectId, message, status, decidedById, decidedAt)
Invitation(id, email, scope[COUNTRY|PROJECT], scopeId, tokenHash, expiresAt, acceptedAt)
AuditEvent(id, actorId, action, entityType, entityId, ip, userAgent, at, metadata)
```

### 5.2 Proposed additions (v0.2, to confirm before M2)

Additions only; no existing names change.

```
Project        + summitListed (bool)                                  // in the Summit catalogue
ProjectGrant   + accessLevel[TEASER|FULL]                             // TEASER = teaser folder only
Folder         + minAccessLevel[TEASER|FULL]                          // teaser folder TEASER, others FULL
Document       + ackTextVersion, acknowledgedById, acknowledgedAt    // upload acknowledgement
User.status    + PENDING_APPROVAL                                     // self-registration
MeetingRequest(id, requesterId, projectId, message, investorRank, countryRank,
               status[PENDING|ACCEPTED|DECLINED|WITHDRAWN], decidedById, decidedAt, slotId)
Room(id, name, capacity)                                              // optional (slot booking)
MeetingSlot(id, roomId, startsAt, endsAt)                             // optional (slot booking)
```

Also open from v0.1, to settle in the same review:

- `Invitation` has no `invitedById` or role for the invitee.
- `AccessRequest` links to an email only, not to a registered user's id.
- `AuditEvent.actorId` must be nullable (failed logins, public requests).
- `User.role` and `CountryMembership.role` overlap: decide which controls country-level access.
- Folder naming: "START HERE + 01 to 07" (note) vs `00_README..07_QA` (model); where the teaser sits (proposed: the 00 folder, TEASER level); whether Compact Clinic outputs get their own folder (Omar to advise); which FULL-level folder holds post-meeting follow-up slides.

---

## 6. Phased timeline (proposed)

Today is Mon 16 Nov. Summit is Wed 9 Dec. On 11 Nov Terra committed to an outline by Fri 13 Nov and a first working
version by Wed 18 Nov; WBG hoped to launch to countries around mid next week.

| Phase                        | Dates            | Output                                                                                                                             | Gate                                                                    |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0. Decisions and set-up      | 11 to 17 Nov     | M1 scaffold done; hosting and login decided; remaining items in section 8                                                         | Internal approval (Marjan)                                              |
| 1. First version             | 16 to 18 Nov     | M2 data model, core of M3 and M4, teaser catalogue and upload with acknowledgement, deployed to Hetzner staging with dummy data | Share with WBG/GCFC/BCG on Wed 18 Nov for feedback                      |
| 2. MVP for country uploads   | 19 to 23 Nov     | Full auth and authorisation tests, country upload flow, invitations by email, admin on-behalf upload, audit, backups              | Security minimum met; acknowledgement text received; countries invited |
| 3. Investor features         | 23 to 30 Nov     | Meeting requests, account approval, request export, watermark, ClamAV, ZAP scan; slot booking only if confirmed                  | Go-live sign-off for investor invitations                               |
| 4. Summit operations         | 1 to 10 Dec      | Support desk, daily monitoring, meeting request reports; bilaterals 8 Dec and morning of 9 Dec                                    |                                                                         |
| 5. Follow-up and next phase  | 10 Dec to Jan    | Post-meeting follow-up slides for attendees; access expiry; per-country export; decision with GCFC on the longer-term platform     | Agreement on hosting, funding and terms for the longer-term track       |

If anything slips, country uploads wait; the build continues on staging. Contingency if the portal cannot go live in
time: a locked-down SharePoint site in the ECD tenant (guest access, per-project permissions, MFA, audit), operated by
the admin team. Not preferred.

---

## 7. Claude Code work breakdown

Run each milestone as its own Claude Code session (from the WSL copy). Commit after each; tests must pass before moving on.
Working order for the 18 Nov first version: M2, M3, M4, then a minimal M9 staging deploy, then M5 and M6.

1. **M1 Scaffold** (done, 11 Nov): Next.js + TS + Tailwind + shadcn, Prisma + Postgres via docker-compose, ESLint/Prettier, Vitest + Playwright, CI on GitHub Actions.
2. **M2 Data model + seed**: Prisma schema from section 5 (5.1 plus agreed 5.2 additions), seed script with 2 fictional countries, 3 fictional projects with dummy teaser PDFs, folder templates. Acceptance: migrations run; seed visible in Prisma Studio.
3. **M3 Auth**: Better Auth with email + password, mandatory TOTP/email OTP, invitation acceptance, terms click-through, session timeout (30 min idle), self-registration behind `SELF_REGISTRATION_ENABLED` (off) with pending-approval status. Acceptance: cannot reach any `/app` route without MFA; a pending account sees nothing.
4. **M4 Authorisation layer**: single `can(user, action, resource)` policy module used by every server action and route handler, with TEASER and FULL levels. Acceptance: tests prove (a) an investor with TEASER on Project A sees only A's teaser folder, (b) no grant on Project B means 403 on B's pages, file URLs and API, (c) a country member of X gets 403 on country Y.
5. **M5 Country workspace**: projects list, folder view, upload (PDF for teasers; max 200 MB), mandatory acknowledgement with stored text version, versioning, "Not yet provided" state, people and invitations, FULL grant/revoke with expiry, admin upload on behalf.
6. **M6 Investor view**: Summit catalogue of all listed projects (filter by country and sector), project page with teaser viewer (pdf.js) and watermark, FULL folders where granted, download respecting view-only flag, "Request a bilateral meeting".
7. **M7 Meeting requests and admin**: country inbox of meeting requests (rank, accept, decline), email notifications, organiser export (CSV), investor account approval queue, audit log viewer + CSV export, user deactivation.
8. **M7b Room slots (optional)**: named rooms with 30-minute slots for 8 Dec and the morning of 9 Dec; an accepted request books a slot; confirmation by email. Only if the organisers confirm no other booking system for those rooms.
9. **M8 Landing page and map**: public landing (Summit context, how access works, sign-in, contact); in-app map of visible projects.
10. **M9 Infra**: Docker Compose stacks (staging, production) on Terra's Hetzner server: app, Postgres, MinIO, ClamAV, reverse proxy and TLS, GitHub Actions deploy over SSH, off-host backups, uptime alerts.
11. **M10 Security pass**: dependency audit, ZAP scan, rate limits, headers, host hardening review, log review, restore test from backup.

---

## 8. Decisions: status

1. **Hosting location**: **DECIDED (16 Nov)**: Terra's existing Hetzner server (Germany) for the pilot and the Summit. Still to do: tell WBG and GCFC the hosting location in writing before countries upload, and include it in the acknowledgement or terms text.
2. **Who operates access**: organisers (GCFC/BCG/WBG) curate and approve investor accounts ("probably all", 11 Nov); countries accept or decline meeting requests and grant FULL access per project. To confirm.
3. **Data roles and text**: data controller (countries / MoFA / GCFC) and Terra as host and processor; upload acknowledgement text (WBG for the Summit, GCFC disclaimer for the longer-term track); investor terms of use. Text needed from WBG/GCFC.
4. **Scale and content**: **largely settled (11 Nov)**: 25 to max 30 one-page teaser PDFs; PowerPoint versions converted to PDF before upload. Longer-term track: full data room content.
5. **Downloads**: proposed: teasers viewable and downloadable with watermark; follow-up slides downloadable by meeting attendees. To confirm.
6. **Retention**: **changed (12 Nov)**: the platform is meant to continue after the Summit with GCFC. Terms, hosting and commercial model for that phase to agree.
7. **Domain and branding**: generic domain name (not "water compact"); "World Bank Group" as the only WBG logo; MoFA/Conference branding clearance. Domain still open.
8. **Support model**: first-line user support (GCFC/BCG) vs technical support (Terra); hours during Summit week. Open.
9. **Public map**: none, or country-level only. Open (low priority).
10. **Content readiness**: teasers ready for all countries except Egypt (11 Nov); country acknowledgements not yet obtained; country contacts for 3 of 9 countries received.
11. **Room slot booking**: organisers to confirm whether the venue has its own booking system for the two bilateral rooms, and whether the rooms are confirmed (sponsor pending).
12. **Login**: **DECIDED (16 Nov)**: email + password with mandatory 2FA; self-registration built but off, to decide later.
13. **Email sending**: ECD service mailbox or a transactional provider. Open.

---

## 9. Risks

| Risk                                                         | Mitigation                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| WBG, MoFA or countries object to hosting in Germany          | State the location in writing before uploads and in the acknowledgement text; Summit content is shareable teasers; app is portable to a UAE host    |
| Shared Terra server: a problem in another service reaches the portal | Separate unix user, network, database and volumes; patching and firewall; off-host backups; dedicated host before the longer-term track        |
| Sensitive uploads (models, feasibility studies) on pilot infrastructure | For the pilot, accept teasers and follow-up slides only; open the full data room for sensitive material once longer-term hosting and terms are agreed |
| First version due Wed 18 Nov                                 | Demo core flows on staging with dummy data; feedback before building further                                                                         |
| Countries do not acknowledge or do not log in                | Acknowledgement is a required step at upload; admin "on behalf of" flow with evidence notes                                                         |
| Too many meeting requests for popular projects (30 to 40)    | Ranking, accept or decline in the inbox, organiser export, manual scheduling after acceptance                                                       |
| Room booking clashes with a venue system                     | Build slot booking only if the organisers confirm there is no other system                                                                          |
| Too little time for security assurance                       | Proven auth library; dummy data on staging; authorisation layer tested first; ZAP scan before real uploads                                          |
| Leakage via forwarded downloads                              | Personal logins, watermarks, view-only flag, audit, expiry                                                                                          |
| Scope creep into Atlas or matchmaking                        | Summit track first; Atlas link and richer matchmaking are later phases                                                                              |
| Portal is read as a free Atlas                               | Present as a Summit-specific service, separate from the Atlas commercial proposal                                                                   |
