# Water Investment Summit Project Portal: Build Plan

Version 0.3 | 18 November 2026 | Owner: Dr Sajid Pareeth, Terra, Expo City Dubai
Status: PROPOSED. Previous versions: `docs/PLAN_v0.2.md`, `docs/PLAN_v0.1.md`.

Sources: GCFC note and wireframe (6 Nov); calls on 6, 11 and 12 Nov (`docs/sources/`); email thread
"Investment Summit -Project Portal!!", in particular Sajid's outline (16 Nov), Dan Vardi (17 Nov), Smita Rawoot (17 Nov),
Benjamin Bartle's inline replies (17 Nov) and **Jacob Kim's consolidated WBG replies (17 Nov, 21:42 UTC)**. Where Ben
and Jacob differ, Jacob's WBG answers are treated as the working decision unless noted.

---

## 0. What changed since v0.2 (read this first)

1. **URGENT: a separate teaser upload-only link, before the portal.** WBG wants to send governments an upload link
   right after the 18 Nov call, so countries upload during 18 to 23 Nov while the portal is finished. It does not need to
   be on the final domain. Build it in the same codebase so no migration is needed (new milestone **M0**).
2. **Speed over features.** Dan Vardi: "we really need this asap, ideally this week"; simplify options if needed.
   Portal live and shared with invitees on **24 Nov** (WBG timeline), not 30 Nov.
3. **No tiers anywhere.** Remove all "Tier 1 / Tier 2" fields, labels and filters (internal to WBG only).
4. **Government upload form is minimal:** country (drop-down), sector (drop-down), uploader name, uploader email, file(s),
   acknowledgement. Nothing else is asked of governments.
5. **Filters for the beta: PPP model, size, development stage.** Entered by the WBG/admin team from the teasers (WBG
   offered to prepare this data in parallel), not by governments. Needs admin metadata editing and CSV import.
6. **Two acknowledgements:**
   - Country uploader, **once per country submission (not per teaser)**, wording fixed by WBG (section 3).
   - Investor/operator, **once per user at account creation**, wording to follow from WBG; must not block the demo
     (use placeholder text, configurable).
7. **Downloads allowed** by default. Watermark optional, only if cheap.
8. **All teasers visible to all invited investors, no per-project restriction.**
9. **Meeting requests: no ranking, no limit.** Simple request with organisation details and a short note. Governments
   pick whom to meet; the request list is also a contact list that must remain exportable after the Summit.
10. **Request decisions by the country focal point, with the relevant WBG coordinator copied** on notifications.
    Focal point list and coordinator mapping to come from WBG in a separate email.
11. **Post-meeting extra slides: dropped.** Remove `ProjectGrant` / extra-material features.
12. **Must-have vs nice-to-have (WBG):** must = invitation-only, personal accounts, two-step verification (by email
    one-time code), country request inbox linked to the government person's email. Nice-to-have = full logging,
    watermark, view analytics. Terra keeps a basic audit log regardless (security baseline, low cost).
13. **Content responsibility:** the government person uploading is responsible for the content; WBG tells them which
    cleaned file to upload. Expo City Dubai is the technical host, not the party clearing content (Ben).
14. **Lifespan unresolved:** WBG understood "live for December, retire end of 2026"; GCFC (Ben) favours keeping it as a
    pilot for a next phase. Design for both: clean export per country and a retire switch; Phase 2 only by separate agreement.
15. **Name/domain:** WBG preferred "waterinvestmentportal"; of the four options, watergateway.org was their top choice.
    Ben suggested projectgateway.org (more generic). All appeared unregistered on 18 Nov:
    waterinvestmentportal.org/.com/.net/.ae, watergateway.org, projectgateway.org. **Not yet decided by Sajid.**
    Keep name and URL in config (`APP_NAME`, `APP_URL`).
16. **Branding:** restrained partner set: MoFA, single World Bank Group mark, GCFC, Expo City Dubai/Terra. UN Water
    Conference branding only with approval (MoFA to lead). Logos as config/assets, easy to swap.
17. **Support:** a shared support mailbox managed by Terra/Expo City Dubai and GCFC, not a personal inbox.
18. **Slot booking:** still open; to be discussed on the 18 Nov call, MoFA/BCG to confirm rooms and whether any other
    booking system exists. WBG timeline puts matchmaking/slot allocation on 30 Nov to 4 Dec. Keep optional (M9).
19. **Invitations:** WBG leads investor/operator outreach (about 40 investors, operators and DFIs contacted so far; a
    live invite tracker proposed); MoFA and GCFC on plenary audience. Whether the portal sends invitations or WBG sends
    the link: to settle on 18 Nov. Build bulk CSV invitations anyway.

---

## 1. Timeline (WBG proposal of 17 Nov, to confirm on the 18 Nov call)

| Date | Milestone |
|---|---|
| **Wed 18 Nov** | Call. WBG wants the teaser upload link right after the call. Realistic Terra commitment to state on the call: upload link live **by Thu 19 Nov** on a temporary address |
| 18 to 23 Nov | Countries upload teasers through the upload link |
| 19 to 20 Nov | Portal demo ready on staging |
| **Fri 20 Nov, after 07:30 Washington (16:30 UAE)** | Technical group walkthrough of the portal |
| 20 to 23 Nov | Clean-up, final screen wording, logos, acknowledgement texts, domain live |
| **Tue 24 Nov** | Portal launched; link shared with invitees and attendees |
| 24 to 30 Nov | Investors browse teasers and submit meeting requests |
| 30 Nov to 4 Dec | Matchmaking; countries accept or decline; slots allocated (if slot module confirmed) |
| 4 to 7 Dec | Final logistics and reminders |
| 8 to 10 Dec | UN Water Conference; Summit on 9 Dec, 15:30 to 18:30; Terra on standby |
| End Dec | Retire or continue, per agreement (see 0.14) |

---

## 2. Scope

### Must (by 24 Nov)
| # | Feature |
|---|---|
| F0 | **Upload-only link** for governments (see 3), live before the portal |
| F1 | Public landing page: Summit context, how access works, sign-in, contact (shared support mailbox), partner logos |
| F2 | Invitation-only personal accounts; email + password + **email one-time code** at sign-in; investor acknowledgement at first sign-in |
| F3 | Pipeline view: all published teasers as cards (country, sector; PPP model, size, development stage when available); filters on those fields; search by title/country |
| F4 | Teaser viewer (pdf.js) with **download allowed** |
| F5 | Meeting request per project: organisation, role, short note; no ranking, no limit |
| F6 | Country request inbox: accept / decline; notifications to focal point **with WBG coordinator in cc**; email to the investor on decision |
| F7 | Admin console: countries, focal points, WBG coordinators, projects, metadata editing + CSV import, publish/unpublish, bulk CSV invitations, request export (CSV) |
| F8 | Basic audit log (sign-ins, uploads, acknowledgements, requests, decisions, downloads) |

### Should / could (only if they do not delay 24 Nov)
| # | Feature |
|---|---|
| F9 | Slot booking for two rooms (8 Dec full day, 9 Dec morning, 30-min slots), if MoFA/BCG confirm and no competing system |
| F10 | Watermark on view and download (viewer name, organisation, time) |
| F11 | View analytics for countries |
| F12 | Map view |

### Removed
Tiers; per-project access restriction; post-meeting extra material (ProjectGrant); ranking; governments entering
teaser data beyond country and sector; full data-room folders (Phase 2 only).

---

## 3. F0: Teaser upload link (build first)

- One link per country (token in URL, e.g. `/submit/<token>`), generated by admin; the country is fixed by the token.
  Fallback if the country list is late: one generic link with a country drop-down.
- Form: country (pre-filled/drop-down), uploader name, uploader email, and one or more teasers, each with a **sector**
  drop-down and a file (PDF or PPTX, max 25 MB; PPTX converted to PDF later or by admin).
- **Acknowledgement, once per submission** (exact WBG wording, store text version):
  > I confirm, on behalf of the represented Government, consent for the uploaded project teaser to be shared with the
  > participants invited to the Water Investment Summit, through the Water Investment Summit Project Portal.
- On submit: files stored privately (UAE storage), records created as DRAFT projects, confirmation email to uploader,
  notification to admin mailbox. Admin can see all submissions and download them.
- The uploader email becomes the country's request-inbox contact unless WBG names another focal point.
- No account or 2FA required for the upload link itself; protect with unguessable tokens, expiry (e.g. 30 Nov),
  rate limiting and file-type checks. Tokens can be revoked.
- Same database and storage as the portal, so no migration later.
- **Fallback if hosting is not ready by 19 Nov:** SharePoint "Request files" link per country in the ECD tenant
  (anonymous upload, no browsing), plus a separate short form for name, email and acknowledgement. Files then imported by admin.

---

## 4. Roles

| Role | Who | Can |
|---|---|---|
| Platform admin | Terra | Everything technical, support, audit export |
| Summit admin | WBG / GCFC / BCG nominated users | Countries, focal points, metadata, publish, invitations, exports |
| Country focal point | Government uploader(s) named by WBG | See own country's projects and requests; accept/decline. Upload via F0 link |
| WBG coordinator | Per country, from WBG | Read own countries' requests; copied on notifications |
| Investor / operator | Invited | View/download all PUBLISHED teasers; submit and track own requests |

Rules: default deny; countries never see other countries' requests; investors never see other investors' requests;
drafts visible only to admins (and own country).

---

## 5. Architecture (unchanged in principle)

Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Better Auth (email OTP 2FA),
private Azure Blob Storage, pdf.js, LibreOffice worker for PPTX to PDF (can be manual at first), email via Microsoft
Graph or Azure Communication Services. Proposed hosting: Azure UAE North under Expo City Dubai (fallback: Terra-managed
UAE VM with Docker Compose). Temporary address for F0 and the demo (e.g. default Azure host name or a Terra subdomain)
until the domain is registered. Name, URL, logos, acknowledgement texts and support email in config.

---

## 6. Data model (v0.3)

```
Country(id, name, iso3, uploadToken, uploadTokenExpiresAt, status)
CountryContact(id, countryId, name, email, role[FOCAL_POINT|WBG_COORDINATOR], userId?)
Submission(id, countryId, uploaderName, uploaderEmail, ackTextVersion, ackAcceptedAt, ip, createdAt)
Project(id, countryId, submissionId?, title, sector, pppModel?, sizeMinUsd?, sizeMaxUsd?, developmentStage?,
        projectType[SUMMIT_PIPELINE|OTHER_PROPONENT], status[DRAFT|PUBLISHED|WITHDRAWN], publishedAt)
Document(id, projectId, kind[TEASER], filename, version, allowDownload default true, blobKey, sha256, sizeBytes,
         scanStatus, uploadedAt, supersededById)
User(id, email, name, organisation, jobTitle, role[PLATFORM_ADMIN|SUMMIT_ADMIN|COUNTRY|WBG_COORDINATOR|INVESTOR],
     countryIds[], status, investorAckTextVersion?, investorAckAcceptedAt?)
Invitation(id, email, role, countryId?, tokenHash, expiresAt, acceptedAt, invitedById)
MeetingRequest(id, projectId, requesterId, organisation, role, note, status[PENDING|ACCEPTED|DECLINED|WITHDRAWN],
               decidedById, decidedAt, createdAt)
Room(id, name, capacity) / Slot(id, roomId, startsAt, endsAt, status, meetingRequestId?)   // F9 only
AuditEvent(id, actorId?, action, entityType, entityId, ip, userAgent, at, metadata)
```
Removed from v0.2: `tier`, `ProjectGrant`, `rank`, `Acknowledgement` per document (replaced by `Submission`),
teaser fields entered by governments (revenueModel, counterparty, tenderTimeline, feedbackSought, documentsPrepared).

---

## 7. Claude Code milestones (re-ordered for speed)

| Order | Milestone | Target |
|---|---|---|
| **M0** | Scaffold (Next.js, Prisma, Postgres, storage adapter) + **F0 upload link** + admin submissions list + emails; deploy to temporary UAE host | **Thu 19 Nov** |
| M1 | Data model v0.3 + seed (fictional Countries A to E, sample teasers; real country list when WBG sends it) | 19 Nov |
| M2 | Auth: invitations, password + email OTP, investor acknowledgement, session timeout | 20 Nov |
| M3 | Authorisation module + tests (rules in section 4) | 20 Nov |
| M4 | Pipeline view, filters (country, sector, PPP model, size, stage), teaser viewer with download | 20 Nov (demo) |
| M5 | Meeting requests + country inbox + notifications with WBG cc + CSV export | 20 Nov (demo, basic) |
| M6 | Landing page with config-driven name, logos, support email | 20 Nov (demo) |
| M7 | Admin console: metadata editing + CSV import, publish, bulk invitations, exports | 23 Nov |
| M8 | Production deployment on final domain, backups, alerts, security pass | 23 Nov |
| M9 | Slot booking (only if confirmed) | by 30 Nov |
| M10 | Nice-to-haves: watermark, view analytics, map | after launch, if time |

**Demo on Fri 20 Nov:** M1 to M6 with fictional data. Visual reference `docs/mockups/` (note: tier labels and the
old acknowledgement wording in the mockups are obsolete; follow this plan).

---

## 8. Still open (to settle on the 18 Nov call or by email)
1. Name and domain (see 0.15) and who registers/owns it.
2. Upload link timing (today vs 19 Nov) and temporary address.
3. Country list, focal points and WBG coordinator per country (WBG, separate email).
4. Investor acknowledgement wording (WBG, separate email).
5. Who sends investor invitations: portal or WBG; invite tracker format.
6. Slot booking: rooms, hours, slot length, any competing system (MoFA/BCG).
7. Logo files and conference branding approval (MoFA).
8. Shared support mailbox address.
9. Hosting acceptance by countries (WBG), now implicitly through the upload consent; confirm.
10. Lifespan after December (WBG: retire end 2026; GCFC: continue as pilot).

## 9. Risks
| Risk | Mitigation |
|---|---|
| Upload link expected today | Commit to 19 Nov; SharePoint "Request files" fallback (section 3) |
| Portal live 24 Nov leaves little hardening time | Must-have list only; nice-to-haves after launch; basic audit kept |
| Teasers arrive as PPTX or mixed formats | Accept PPTX; admin converts; LibreOffice worker later |
| Focal point list late | Generic upload link with country drop-down; uploader email becomes contact |
| Lifespan disagreement | Export and retire switch built in; Phase 2 only by separate agreement |
