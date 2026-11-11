# Water Investment Summit Secure Project Portal: Build Plan

Version 0.1 | 11 November 2026 | Owner: Dr Sajid Pareeth, Terra, Expo City Dubai
Status: PROPOSED. For discussion with GCFC, BCG and MoFA. Nothing here is agreed.

Sources reviewed: Benjamin Bartle's portal note (6 Nov), the 6 Nov call transcript, the ChatGPT wireframe
(water-investment-summit-wireframe-ben.benjibartle.chatgpt.site) and the email thread "Investment Summit - Project Portal!!" (4 to 7 Nov).

---

## 1. What we are building

A secure, invitation-only data room where participating countries share project documents with the investors
and operators they approve, ahead of bilateral meetings at the Water Investment Summit (9 December 2026, Abu Dhabi).

- Scale: 8 to 9 countries, about 20 to 25 projects (WBG/IFC pipeline, still being finalised). Tier 1 = presented at the Summit; Tier 2 = data room only.
- Life: about 2 months of live operation (mid-November 2026 to mid-January 2027), then archive, return or hand over.
- Data belongs to the countries. Sensitive content: policy, legal and regulatory material, feasibility studies, financial and economic models, procurement.
- Positioned within the Global Water Investment Atlas framing, but built and launched independently of the Atlas architecture.

### Out of scope for v1

Public project directory, investor browsing across countries, AI features, Atlas data layers, Q&A threads inside the
portal, e-signature, payments, non-country proponents (ADFD, FAB and others come later through a project-type field).

---

## 2. What the wireframe gets right, and what changes in a real build

The wireframe and note are a sound user journey. From a practical build view:

| Wireframe / note                                                    | Build decision                                                                                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public landing, no project catalogue                                | Keep. Static page, bilingual-ready (EN first).                                                                                                                              |
| Email + password + second step                                      | Keep. MFA mandatory for every user (TOTP app or email one-time code). No shared folder passwords anywhere.                                                                  |
| Investor sees only approved project rooms                           | Keep. Permissions are per user per project, enforced on the server for every request and every file.                                                                        |
| Country focal point invites colleagues and approves external access | Keep, but add an admin "on behalf of" route: GCFC/BCG content team can upload and record approvals when a country prefers not to log in. Every action records who approved. |
| Standard folders 01 to 07 + START HERE                              | Keep as fixed folder templates per project; empty folders show "Not yet provided".                                                                                          |
| Expression of interest (EOI) route                                  | Keep. EOI form inside the portal for registered users, or a public request form that creates a pending request. Country approves or declines.                               |
| Expiry, revocation, audit trail                                     | Keep. Grants carry an expiry date (default: 31 Jan 2027). Full activity log exportable as CSV.                                                                              |
| Interactive map (raised on the call)                                | Inside the secure area only: map of the projects the user can access. Optional public map at country level only, if countries agree.                                        |

Added for a live service: dynamic watermark (viewer name, email, timestamp) on PDF view and download; per-document
"view only" flag; virus scanning on upload; file versioning; terms-of-use / confidentiality click-through at first login;
data export per country at close-out.

---

## 3. Roles and permissions

| Role                | Who                                | Can                                                                                                                         |
| ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Platform admin      | Terra technical team               | Everything, incl. user support, audit export. Cannot be the content approver of record.                                     |
| Content admin       | GCFC / BCG Summit team             | Create countries and projects, upload on behalf of countries, record approvals with evidence, view audit.                   |
| Country focal point | Nominated per country              | Manage own country's projects and files, invite country colleagues, approve or decline investor access per project, revoke. |
| Country member      | Invited by focal point             | Upload and update files in own country's projects. No access decisions.                                                     |
| Investor / operator | Invited or EOI-approved individual | Read-only access to granted project rooms only; contact focal point.                                                        |

Rule: no role sees another country's workspace except admins. No investor sees a project without an explicit, unexpired grant.

---

## 4. Proposed architecture (UAE-hosted)

Recommended stack, chosen for speed with Claude Code, low running cost and UAE data residency:

- **App**: Next.js (App Router, TypeScript), Tailwind + shadcn/ui, React-Leaflet for the map.
- **Database**: PostgreSQL 16 with Prisma ORM.
- **Auth**: Better Auth (self-hosted, stores identities in our Postgres, so identity data also stays in the UAE) with email+password, mandatory 2FA (TOTP / email OTP), invitation tokens, session timeout. Alternative: Microsoft Entra External ID if its tenant data location is acceptable (to verify).
- **File storage**: Azure Blob Storage, private containers, files never public; access through the app with short-lived (5 min) signed URLs or streamed downloads, after a permission check.
- **Malware scan**: Microsoft Defender for Storage on-upload scanning (or ClamAV container).
- **Email**: Microsoft Graph sendMail from an ECD service mailbox, or Azure Communication Services Email (verify data location).
- **Hosting**: Azure UAE North (Dubai) region: App Service or Container Apps, Azure Database for PostgreSQL Flexible Server, Key Vault, Application Insights. Fallback: Terra-managed Ubuntu VM in the UAE with Docker Compose (Next.js + Postgres + MinIO). Not the Germany server.
- **Environments**: local (Docker), staging (dummy data only), production (real data only after hosting sign-off).
- **Domain**: e.g. `summitportal.<agreed-domain>` with TLS; domain owner to be agreed (ECD/Terra vs MoFA/Conference).

Security baseline: HTTPS only, HSTS, CSP; encryption at rest (platform default) and in transit; least-privilege managed
identities; secrets in Key Vault; daily DB backups (35-day retention) and blob soft delete; rate limiting on auth;
lockout after failed attempts; all authorisation in server code with automated tests; external penetration
test or at least an OWASP ZAP scan before live data.

---

## 5. Data model (first cut)

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

---

## 6. Phased timeline (proposed)

Today is Wed 11 Nov. Summit is Wed 9 Dec. Benjamin wants country uploads within about two weeks.

| Phase                      | Dates           | Output                                                                                                       | Gate                                                                      |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 0. Decisions and set-up    | 11 to 14 Nov    | Answers to section 8, hosting decision, domain, repo scaffold, Azure subscription and resources in UAE North | Internal approval (Marjan) and hosting location agreed with MoFA          |
| 1. MVP build               | 15 to 23 Nov    | Auth + MFA, roles, country workspace, upload/versioning, project rooms, invitations, audit, landing page     | Staging demo to GCFC/BCG                                                  |
| 2. Hardening and UAT       | 23 to 27 Nov    | Watermarking, EOI flow, map, scans, security tests, README content, terms of use                             | Countries' acceptance of hosting confirmed via WBG; security check passed |
| 3. Country onboarding      | from 30 Nov     | Focal points invited, real uploads, investor invitations                                                     | Go-live sign-off                                                          |
| 4. Summit operations       | 1 to 10 Dec     | Support desk, daily monitoring, access reports to GCFC                                                       |                                                                           |
| 5. Hypercare and close-out | to mid-Jan 2027 | Access expiry, per-country export, archive or deletion per agreement, lessons learnt, optional Atlas link    | Close-out confirmation from each country                                  |

If hosting sign-off slips, the build continues on staging; only real uploads wait. Contingency if the portal itself
cannot go live in time: a locked-down SharePoint site in the ECD tenant (guest access, per-project permissions, MFA, audit),
operated by the admin team. Not preferred, as it is harder to keep clean at project level.

---

## 7. Claude Code work breakdown

Run each milestone as its own Claude Code session. Commit after each; tests must pass before moving on.

1. **M1 Scaffold**: Next.js + TS + Tailwind + shadcn, Prisma + Postgres via docker-compose, ESLint/Prettier, Vitest + Playwright, CI on GitHub Actions. Acceptance: `npm run dev` and `npm test` green.
2. **M2 Data model + seed**: Prisma schema from section 5, seed script with 2 dummy countries, 3 dummy projects, folder templates. Acceptance: migrations run; seed visible in Prisma Studio.
3. **M3 Auth**: Better Auth with email+password, mandatory TOTP/email OTP, invitation acceptance, terms click-through, session timeout (30 min idle). Acceptance: cannot reach any `/app` route without MFA.
4. **M4 Authorisation layer**: single `can(user, action, resource)` policy module used by every server action and route handler. Acceptance: Playwright + unit tests prove an investor with a grant on Project A gets 403 on Project B's pages, file URLs and API.
5. **M5 Country workspace**: projects list, folder view, upload (chunked, max 200 MB), versioning, "Not yet provided" state, people and invitations, grant/revoke with expiry.
6. **M6 Investor view**: "My access" list, project room with README, document viewer (pdf.js) with watermark overlay, download respecting view-only flag, contact focal point.
7. **M7 Access requests and admin**: EOI form, approval queue for focal points and content admins (with evidence note), audit log viewer + CSV export, user deactivation.
8. **M8 Landing page and map**: public landing (Summit context, how access works, sign-in, contact); in-app map of accessible projects.
9. **M9 Infra**: Bicep or Terraform for UAE North resources, Key Vault, managed identity to Blob, deployment pipeline to staging and production, backups and alerts.
10. **M10 Security pass**: dependency audit, ZAP scan, rate limits, headers, log review, restore test from backup.

---

## 8. Decisions needed (for today's meeting)

1. **Hosting location**: UAE (Azure UAE North under ECD). WBG to confirm with each country before real uploads; written confirmation needed.
2. **Who operates access**: country focal points in the portal, the GCFC/BCG content team on their behalf, or both.
3. **Data roles**: which entity is data controller (countries / MoFA / GCFC) and Terra as technical host and processor; short terms of use and confidentiality text for investors (drafted by GCFC/WBG legal).
4. **Scale and content**: final country and project list, expected total volume (GB), largest file, file types (PDF, XLSX models, CAD, GIS?).
5. **Downloads**: allowed by default, or view-only for financial models and procurement folders.
6. **Retention**: what happens after mid-January: return to countries, delete, or migrate to a longer-term platform.
7. **Domain and branding**: whose domain and logos; MoFA/Conference branding clearance; how it is described relative to the Atlas.
8. **Support model**: first-line user support (GCFC/BCG) vs technical support (Terra); hours during Summit week.
9. **Public map**: none, or country-level only.
10. **Content readiness date**: when the first country packages actually arrive, to fix the go-live date.

---

## 9. Risks

| Risk                                        | Mitigation                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Countries object to UAE hosting after build | Confirm via WBG before uploads; keep storage pluggable; per-country export ready                              |
| Too little time for security assurance      | Use proven auth library and managed Azure services; dummy data on staging; test the authorisation layer first |
| Countries don't log in or manage access     | Admin "on behalf of" flow with evidence notes                                                                 |
| Leakage via forwarded downloads             | Personal logins, watermarks, view-only flag, audit, expiry                                                    |
| Scope creep into Atlas                      | Keep v1 to the Summit pipeline; Atlas link is a later phase                                                   |
| Portal is read as a free Atlas              | Present as a Summit-specific service, separate from the Atlas commercial proposal                             |
