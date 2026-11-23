# Water Investment Summit Project Portal: Build Plan

Version 0.4 | 22 November 2026 | Owner: Dr Sajid Pareeth, Terra, Expo City Dubai
Status: PROPOSED. **Read section 0b first** (20 Nov test run and emails), then **0c** (WBG replies of 23 Nov). Previous versions: `docs/PLAN_v0.3.md`, `docs/PLAN_v0.2.md`, `docs/PLAN_v0.1.md`.

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
18. **Slot booking:** built 20 Nov (user decision; rooms and hours updated 22 Nov, see 0b.24): Room A and Room B, 30-minute slots, 8 Dec 09:00 to 17:00, 9 Dec
    09:00 to 13:00 and 10 Dec 09:00 to 17:00 UAE time (10 Dec added 20 Nov at the user's request) (src/lib/meetings/schedule.ts). The investor picks a time on the request; the first free
    room is held until the country answers (accept books it, decline or withdraw frees it). No investor or country
    has two meetings at once. Admins see the grid under Admin, Meeting schedule. Rooms, hours and any competing
    booking system still to be confirmed with MoFA/BCG; changing them is a one-line edit.
19. **Invitations:** WBG leads investor/operator outreach (about 40 investors, operators and DFIs contacted so far; a
    live invite tracker proposed); MoFA and GCFC on plenary audience. Whether the portal sends invitations or WBG sends
    the link: to settle on 18 Nov. Build bulk CSV invitations anyway.

### 0a. Decisions by Sajid, 18 Nov (after v0.3; these override the points above where they differ)
1. **Hosting:** Terra's Hetzner server for the time being (see section 5). All other v0.3 points stand.
2. **Email from the Summit mailbox** (revised later on 18 Nov; replaces "no email for now"). The portal sends from
   summit@waterinvestmentprojects.org over SMTP (`MAIL_DRIVER=smtp`, details in the server's `.env`); the inbox is
   read at the mail provider (Outlook or webmail), not in the portal. Provider still to be chosen (Microsoft 365
   in the ECD tenant, Google Workspace or Zoho); domain DNS needs MX, SPF, DKIM and DMARC. Locally, Mailpit shows
   every email at http://localhost:8025.
3. **Sign-in: email + password only for now.** No second step (neither email code nor authenticator app) until
   email is set up. Self-registration stays off.
4. **Accounts are handed out by admins:** an admin creates each account with a generated temporary password that
   must be changed at first sign-in; the admin passes on the email and temporary password personally. No
   invitation emails.
5. **Notifications:** every teaser submission emails a confirmation to the uploader and a notice to the Summit
   mailbox (`ADMIN_NOTIFY_EMAIL`); new projects and bilateral meeting requests will notify the Summit mailbox too
   (M5, M7, through `notifySummitTeam` in `src/lib/mail`). Admin pages keep counts and "new" markers, so nothing
   depends on email arriving. Emails to focal points, WBG coordinators and investors: not decided yet.
   Sign-in (point 3) and account hand-out (point 4) stay as they are until decided otherwise.

### 0b. Changes from the 20 Nov portal test run and emails of 18 to 21 Nov (v0.4; these override 0 and 0a where they differ)

Sources: `docs/sources/2026-11-20_Portal_test_run_transcript.txt` (Jacob Kim, Smita Rawoot, Benjamin Bartle, Sajid);
Jacob's email "RE: Water Investment Portal test run" (20 Nov, teaser examples and project list, saved as
`docs/sources/2026-11-20_WBG_project_list_DEV_ONLY.csv`); "Investment Summit follow up" thread (18 to 20 Nov);
"Logos for WB coms for the Investment Summit" (20 Nov). Items marked *(built?)* appear in the git log of 20 Nov:
verify them, do not rebuild.

**Name and domain**
1. Confirmed in the meeting: **Water Investment Projects**, waterinvestmentprojects.org (Jacob accepted it in place of
   "waterinvestmentportal", which was not quickly available). Partners also write "Water Investment Projects Portal".

**Government upload link (F0)**
2. Upload form questions (Sajid, 22 Nov), all required: **Full name**, **Email**, **Job title** and **Represented
   government organisation**. Keep the existing label "Represented government organisation" exactly
   *(built: `Submission.governmentOrganisation`)*; it covers ministries, PPP units and sub-national bodies. Add
   **Job title** (new `Submission.uploaderJobTitle`, shown in the admin submissions list and export). Jacob asked for
   "name, contact, title, organisation" (20 Nov, 0:08). Name and email are already required (`uploaderName`,
   `uploaderEmail`); keep email as the contact.
3. Acknowledgement wording changes from "the represented Government" to "a government organisation". Jacob posted the
   exact text in the meeting chat (not in the transcript). Working text until Jacob confirms, as a new version
   `country-upload-ack-v2`:
   > I confirm, on behalf of the government organisation I represent, consent for the uploaded project teaser(s) to be
   > shared with the participants invited to the Water Investment Summit, through the Water Investment Projects portal.
4. **Accept all common document and image formats (Sajid, 22 Nov), not only PDF and PowerPoint.** Countries will
   upload the wrong format; admins convert. Allowed: PDF; PowerPoint (PPT, PPTX); Word (DOC, DOCX); Excel (XLS, XLSX);
   OpenDocument (ODT, ODP, ODS); RTF; images (JPG, JPEG, PNG). Still refused: executables, scripts, archives (ZIP, RAR,
   7z), HTML and anything else. Check the file signature as well as the extension, keep the size limit, and keep the
   ClamAV scan. Investors only ever see the PDF an admin publishes: a non-PDF upload stays a draft until an admin
   converts it (manually or with LibreOffice later) and attaches the PDF. Upload page help text: "PDF preferred;
   PowerPoint, Word, Excel and images are also accepted".
5. **Delete the sentence "No account is needed"** on the upload page (Jacob: it suggests no account is needed later).
6. Unlimited teasers per submission stays. **One PDF can hold several projects** (Angola: 4 projects on 2 pages).
   Admins must be able to create several projects from one uploaded file (same `Document` linked to each project, with
   an optional page reference), or split the file.
7. Metadata comes from the PDF (server-side extraction script) and is **reviewed by an admin** before publishing;
   scanned PDFs need manual entry.
8. Drop-down values follow the WBG list (`docs/sources/2026-11-20_WBG_project_list_DEV_ONLY.csv`):
   - **Sector (sub-sector):** Water supply; Water treatment; Wastewater treatment; Wastewater and reuse; Water supply and
     wastewater; Desalination; Sludge; Non-revenue water (NRW); Irrigation infrastructure; Other.
   - **PPP modality (admin):** Affermage; Management contract and affermage; Concession; BOT; DBO; DBOM; DBFOM; DBFOMT;
     O&M; Performance-based contract (PBC); Other / TBD.
   - **Development phase (admin):** Conceptual; Feasibility in progress; Design in progress; Post-feasibility; Due
     diligence; Transaction advisory; Pre-tender; RFQ; RFP.
   - **Size:** USD million, or "TBC". Add **Region** (free text) to Project.
   - **Countries now 11 / 28 projects** (dev list): Angola, Azerbaijan, DRC, Egypt, Jordan, Morocco, Pakistan,
     Saint Lucia, Sierra Leone, Sri Lanka, Tanzania. The list is unconfirmed and for development only: use it for
     vocabularies and the CSV import format; **Sajid to decide** whether it may be loaded on staging (the
     "no real country data in staging" rule stands until he says so).
9. Admin CSV import uses the WBG column names: Country, Region, Project name, Sub-sector, PPP modality, Development
   phase, Size ($m).

**Country accounts**
10. Each country gets a **unique upload URL plus pre-created username and password**, all on waterinvestmentprojects.org.
11. **No forced password change for country accounts.** WBG relationship managers or transaction advisers may
    co-manage a country account with the government, and a change by one would lock out the other (Jacob; agreed for
    the Summit context, about 15 country users for about one month). Sajid noted this falls short of normal security
    practice: use long generated passwords, rate limiting, audit, admin reset, and expire the accounts after the
    Summit. Override `mustChangePassword` for COUNTRY (and WBG coordinator) accounts; keep it for investors.
12. **Several people per country**, including WBG relationship managers who act for the country (can decide
    requests). Create individual accounts where the list names people. WBG staff who only monitor stay
    `WBG_COORDINATOR` (read and export only).
13. Sajid sends Jacob the country links and the list of roles (admin, WBG contact, country contact, investor); Jacob
    returns the people per role. Received 23 Nov: see 0c.
14. **Country users now see the whole published pipeline** ("Pipeline projects": all countries' published teasers,
    read-only), plus **My projects** (own country, any status) and **Meeting requests**. This replaces the M3 rule
    "country users see only their own countries' projects". Update `src/lib/authz` and its isolation tests:
    other countries' drafts and all other countries' requests stay hidden.
15. If meeting requests are not ready when country links go out, show "coming soon" instead of hiding errors.
16. Countries should **see their demand** even if they decline: counts of requests per project by organisation type.
    Add `organisationType` to investor registration (Infrastructure operator or developer; Investor or fund; DFI or
    MDB; Commercial bank; Transaction or technical adviser; Other).

**Investors and operators: self-registration with pre-approval (replaces 0a.3 "self-registration stays off" for investors)**
17. Landing page: **"Investor or operator? Register here."** Registration: name, email, organisation, organisation
    type, title, password (chosen by the person), then the investor acknowledgement.
18. **Pre-approved list:** WBG (Jacob) sends about 30 target companies and named people. A registrant whose email is on
    the list, or whose email domain belongs to a pre-approved organisation, gets **immediate access**. Never
    auto-approve public email domains (gmail.com, outlook.com and similar).
19. **Everyone else waits for approval** (status `PENDING_APPROVAL`, no pipeline access). The Summit mailbox is told;
    an approver (Jacob or a WBG designate, as Summit admin) approves or rejects in the admin console; the registrant
    is told the outcome. Approver address is a placeholder (Jacob or the Summit mailbox) until WBG names one.
20. Admins can still create investor accounts directly, including during the Conference for late additions.
21. New data: `ApprovedOrganisation(id, name, emailDomains[], source)`, `ApprovedContact(email, organisationId?)`,
    `UserStatus` adds `PENDING_APPROVAL` and `REJECTED`; audit every registration and decision.

**Meeting requests and slots**
22. Request form carries the requester's email and attendee name. *(built? commit 52fcce3)*
23. **No screening of requests by the Summit team.** The country decides; the Summit mailbox is only informed. No
    follow-up monitoring was asked for; a reminder to countries with pending requests is optional.
24. **Rooms (MoFA, via Ben, 18 Nov):** Meeting Room 2 (22 people) and Meeting Room 3 (10 people); 8 Dec 12:00 to 19:00
    and 9 Dec 09:00 to 12:00 UAE time, still **subject to sponsorship confirmation**. Smita will confirm room names and
    exact slots; Jacob wants the widest window (conference hours roughly 09:00 to 19:00). The code currently uses Room A
    and Room B, 8 Dec 09:00 to 17:00, 9 Dec 09:00 to 13:00 and 10 Dec 09:00 to 17:00. Keep A/B until Smita confirms,
    then change names and hours in `src/lib/meetings/schedule.ts`. Note: no source shows rooms held on 10 Dec.
    **Finalised 22 Nov (user):** Meeting room 1 is **Al Jimi** (22 people) and Meeting room 2 is **Shawka** (10 people), shown in the portal as "Room 1 - Al Jimi" and "Room 2 - Shawka",
    both in use 09:00 to 19:00. Built: 09:00 to 19:00 on all three days, 9 Dec included (user decision, 22 Nov,
    although the Summit runs from 15:30 that day). Existing Room A and Room B rows are renamed in place on the next read, so held and booked
    slots stay. Open: which days the rooms are actually held (10 Dec still unconfirmed).
25. Jacob asked whether an official UN Water Conference matchmaking platform exists. Not resolved; the portal keeps its
    own simple request and slot flow.

**Email**
26. summit@waterinvestmentprojects.org is the **back-end mailbox for incoming items** (meeting requests,
    registrations). Sajid will forward from it to Jacob and to focal points as needed. Mail sent by the portal risks
    landing in junk: keep emails to external users (focal points, investors) **off until SPF, DKIM and DMARC pass and a
    test reaches Outlook and Gmail inboxes**. Access details go out personally (Sajid or WBG), not from the portal.

**Branding and landing page**
27. Landing page "In partnership with": **World Bank Group** (single mark), **GCFC**, **Expo City Dubai / Terra** and the
    **2026 UN Water Conference** logo. **No MoFA logo** (Smita). Show the placement to Smita before the page goes
    public (Sheena, 20 Nov). Logos to come from GCFC (sent to Nigina Alieva, WBG), WBG and Terra communications.
28. Partners may suggest landing page text, a news item or an image; keep these easy to edit in config or content files.

**Admin**
29. One admin login is shared among the organisers for now (Sajid). Prefer individual Summit admin accounts for Jacob
    and other approvers so approvals are attributable in the audit log.

**Timeline (updated)**
30. Sat 21 Nov: country links and role list to Jacob (promised in the meeting; **not yet sent as of 22 Nov**).
    Mon 23 Nov (Asia morning): Jacob sends links to countries. **Mon 23 Nov, 17:30 to 18:00 UAE:** check-in call
    (Ben to send invite). **Tue 24 Nov:** all teasers in the system, portal shared with the wider audience (investor link
    now likely Wed 25 Nov, see 0c.9). 24 Nov to
    about 1 Dec: investors review and request meetings. 30 Nov to 4 Dec: matchmaking and slots. Summit 9 Dec (time
    given as 15:30 to 18:30 earlier and as 15:30 to 17:00 in a 20 Nov email; to confirm).

**Hosting (no change, but a flag)**
31. Hosting stays on Terra's Hetzner server in Germany (0a.1). `docs/DEPLOYMENT.md` says the 16 Nov email told the
    group the data location; the email as sent did not mention hosting. Data location has not been stated to WBG or
    the countries since Benjamin raised jurisdiction concerns on 6 Nov. Sajid to decide whether to state it.

### 0c. WBG replies of 23 Nov (these override 0b where they differ)

Source: Jacob Kim, "RE: Water Investment Portal test run" (23 Nov, 06:26 UTC), answering Sajid's request of 22 Nov
(people per role, pre-approved list, registration approver, investor texts). **The names, email addresses and company
list stay in that email.** Enter them on production through the admin console only; do not commit them to the repo
or load them on local or staging (the "no real country data" rule stands).

**People per country (answers 0b.13)**
1. Ten rows, "to the extent available at this time; the Lead WB person is fixed": Angola, DRC, Egypt, Jordan, Morocco,
   Pakistan (Kasur), Pakistan (Chakwal), Saint Lucia, Sierra Leone, Tanzania. Each row names a government contact and
   a **lead WBG contact** (name and email).
2. Gaps to chase with Jacob:
   - no government contact yet for **Sierra Leone** and **Tanzania**;
   - no government email for **Jordan** and **Morocco**;
   - **Azerbaijan** and **Sri Lanka** (in the 20 Nov dev list, 0b.8) are not in the table: ask whether they still take
     part.
   - **Decided 23 Nov (Sajid):** every country in Jacob's table that production does not have yet is added there
     (Pakistan once). Countries already on production stay.
3. Accounts on production, following 0b.11 and 0b.12:
   - the government contact gets a `COUNTRY` account on their country;
   - the lead WBG contact also gets a `COUNTRY` account on that country (a relationship manager who acts for the
     country and may decide requests, as asked in Sajid's email). Where no government contact exists yet, the lead
     WBG contact covers the country alone;
   - passwords are handed over personally (0b.26).
4. **Pakistan has two sub-national entries** (Kasur and Chakwal), each with its own government contact and the same
   lead WBG contact. **Decided 23 Nov (Sajid): one country "Pakistan"** with both focal points, and the place
   (Kasur, Chakwal) in the project's Region field. Both focal points see each other's projects and requests.
5. Both Pakistan government contacts use personal webmail addresses. This is acceptable for admin-created `COUNTRY`
   accounts (the public-domain rule in 0b.18 applies to investor self-registration only), but confirm with Jacob that
   these are the addresses to use.

**Pre-approved investors and operators (answers 0b.18)**
6. **23 organisations** with their website domains, no named people yet. Jacob: "not complete and will be updated".
   - Enter them under Admin, Pre-approved organisations and people.
   - A website domain is not always the email domain (for example a group brand and its operating company). Check
     each one, and add the right email domain when a registration from that organisation lands in the pending queue.
   - **Decided 23 Nov (Sajid): pre-approved registrants get straight in** (`REGISTRATION_AUTO_APPROVE=true` on
     production). Known risk: the portal does not verify that a registrant owns the email address, so someone
     typing an address at a pre-approved domain gets in without approval. Mitigations: approvers watch the
     registrations list and the audit log, and can deactivate an account at once; email verification at
     registration is the fix once external email passes the deliverability check (0b.26).
   - The 23 domains go onto production's pre-approved list (Admin, Pre-approved organisations and people) as Jacob
     sent them.
   - No named contacts, so no logins are pre-created.

**Registration approvers (answers 0b.19 and 0b.29)**
7. **Jacob Kim, Dan Vardi and Jason Lee** (WBG) approve new investor registrations.
   - Only admins can approve today (`canManagePreApproval`, `canManageAccounts`). Give each of them an individual
     Summit admin account, so every approval is attributable in the audit log.
   - New registrations keep notifying the Summit mailbox, and Sajid forwards them until external email passes the
     deliverability check (0b.26).

**Investor texts and timeline**
8. The investor consent and acknowledgement texts are **not received yet**. Jacob is chasing the WBG team on Mon 23
   Nov; the texts are needed only before investors get the link. Until then, the current investor acknowledgement
   stays the working text.
9. **Investor link: now likely Wed 25 Nov** (was Tue 24 Nov in 0b.30). Country links are unaffected.

**Logos**
10. Jacob attached the **World Bank Group logo** and a **Water Forward logo**.
    - Replace `public/partners/world-bank-group.png` with the WBG file if it differs.
    - **Decided 23 Nov (Sajid): Water Forward joins the partner list**, after the WBG mark
      (`public/partners/water-forward.png`).
    - The **2026 UN Water Conference** logo is the "2026 UN Water Conference, Abu Dhabi" mark Sajid supplied on
      23 Nov (`public/partners/unwc-2026.png`; the version on sdgs.un.org was not the right one). It replaces the placeholder; 0.16 (UN Water Conference
      branding with MoFA's approval) still applies before the page is widely shared.
    - The rooms (Smita's part of the 22 Nov email) were settled separately (0b.24).

**Admin master calendar and hand-out (Sajid, 23 Nov)**
11. **Admin, Meeting calendar** (replaces the read-only Meeting schedule grid), built 23 Nov:
    - one day at a time, every 30-minute time by room, with totals of booked, awaiting country, blocked and free;
    - each booking shows the project and country, the attendee, organisation, role and email, the account, when it
      was requested and accepted, and the note;
    - **Block** free times, one at a time or as a range of a day (one room or all rooms, optional reason shown only
      to admins). Investors see blocked times as not available and cannot take them; times a request holds are
      never blocked (cancel first). **Unblock** offers them again;
    - **Cancel meeting** cancels a request awaiting the country or a confirmed meeting (new status `CANCELLED`). The
      slot is freed, and the investor, the country's focal points (coordinators copied) and the Summit mailbox are
      emailed, with the reason if one is given. The investor may request the project again;
    - admins only (`canManageMeetingSchedule` in `src/lib/authz/slots.ts`); every block, unblock and cancel is
      audited (`slot.block`, `slot.unblock`, `meeting_request.cancel`).
    Data model: `SlotStatus.BLOCKED`, `Slot.blockedReason`, `MeetingRequestStatus.CANCELLED` (additive migration
    `admin_meeting_calendar`).
12. **Hand-out workbook for WBG and partners:** country upload links, country logins (government focal points and
    lead WBG contacts as `COUNTRY` accounts), Summit admin logins for Jacob Kim, Dan Vardi, Jason Lee and Benjamin
    Bartle (GCFC), sign-in URLs and the pre-approved list. Built on the server by the deploy session from production
    data; it holds passwords, so it is never committed and is shared only with the people named.
13. **Delete project and remove user** (Sajid, 23 Nov):
    - **Delete project** on the project page. Admins: any project. Country users (not WBG coordinators): their own
      country's projects that are not published (drafts and withdrawn ones); a published one is deleted by the
      Summit team. The project, its teaser documents and files and its meeting requests go for good; open requests
      are cancelled first (slot freed, investor, country and Summit mailbox emailed). The consent submission stays.
      Audited as `project.delete` (`canDeleteProject` in `src/lib/authz/projects.ts`).
    - **Remove user** on Admin, Accounts (erase and disable). Admins only, never their own account, Summit admins
      not platform admins (`canRemoveUser` in `src/lib/authz/admin.ts`). Sessions, sign-in credentials, country
      memberships, country contacts and pending invitations are deleted; name and email are erased (the address
      becomes `removed-<id>@removed.invalid`, so the real one can be reused); status DEACTIVATED and `removedAt`
      set; open meeting requests cancelled (countries and the Summit mailbox told). The row stays for the audit
      trail; past requests keep the attendee details the investor typed. Audited as `user.remove`.
14. **One "Meeting calendar" section for the Summit team** (Sajid, 23 Nov): the portal header and the admin row show
    "Meeting calendar" instead of "Meeting requests" for admins, with two views: **Calendar** (`/admin/meetings`)
    and **All requests** (`/inbox`, every request with or without a time, decisions on behalf, CSV). Country users
    and coordinators keep their own "Meeting requests".
15. **The uploader edits key facts** (Sajid, 23 Nov; replaces "Summit team only" for key facts): on the project
    page, the person who uploaded the project may edit its key facts and use Fill from teaser while it is not
    published; admins always. "Uploaded" means a teaser uploaded from their account (My projects) or an
    upload-link submission made with their account's email. Other users of the country, coordinators and
    investors cannot (`canEditProjectFacts` in `src/lib/authz/projects.ts`, `isProjectUploader` in
    `src/lib/authz/data.ts`). Every save is audited as `project.update`.

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
| F9 | Slot booking for two rooms (8 to 10 Dec, 09:00 to 19:00, 30-min slots; rooms and hours updated 22 Nov), if MoFA/BCG confirm and no competing system |
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

**Hosting decision (18 Nov, Sajid): Terra's Hetzner server for the time being**, as its own Docker Compose stack
(app, Postgres, S3-compatible storage such as MinIO, behind the server's reverse proxy with TLS); secrets in a
root-only `.env` on the server. All other points of v0.3 stand. The Azure UAE North text below is kept as the
longer-term option only.

Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Better Auth (email OTP 2FA),
private Azure Blob Storage, pdf.js, LibreOffice worker for PPTX to PDF (can be manual at first), email via Microsoft
Graph or Azure Communication Services. Proposed hosting: Azure UAE North under Expo City Dubai (fallback: Terra-managed
UAE VM with Docker Compose). Temporary address for F0 and the demo (e.g. default Azure host name or a Terra subdomain)
until the domain is registered. Name, URL, logos, acknowledgement texts and support email in config.

---

## 6. Data model (v0.3)

```
Country(id, name, iso3, status)
UploadLink(id, countryId? [null = generic link], tokenHash, expiresAt, revokedAt?, createdById, createdAt)
CountryContact(id, countryId, name, email, role[FOCAL_POINT|WBG_COORDINATOR], userId?)   // unique (countryId, email, role)
Submission(id, countryId, uploadLinkId? [null = portal upload], uploaderName, uploaderEmail, ackTextVersion,
           ackAcceptedAt, ip, createdAt)
Project(id, countryId, submissionId?, title, sector, pppModel?, sizeMinUsd?, sizeMaxUsd?, developmentStage?,
        projectType[SUMMIT_PIPELINE|OTHER_PROPONENT], status[DRAFT|PUBLISHED|WITHDRAWN], publishedAt)
Document(id, projectId, submissionId, kind[TEASER], filename, version, allowDownload default true, blobKey, sha256,
         sizeBytes, scanStatus, uploadedById?, uploadedAt, supersededById)
User(id, email, name, organisation, jobTitle, role[PLATFORM_ADMIN|SUMMIT_ADMIN|COUNTRY|WBG_COORDINATOR|INVESTOR],
     countryIds[], status, investorAckTextVersion?, investorAckAcceptedAt?, removedAt?)
     // removedAt added 23 Nov: the account was removed (name and email erased), 0c.13
Invitation(id, email, role, countryId?, tokenHash, expiresAt, acceptedAt, invitedById)
MeetingRequest(id, projectId, requesterId, organisation, role, note,
               status[PENDING|ACCEPTED|DECLINED|WITHDRAWN|CANCELLED], decidedById, decidedAt, createdAt)
               // CANCELLED added 23 Nov: cancelled by the Summit team (0c.11)
Room(id, name, capacity) / Slot(id, roomId, startsAt, endsAt, status[OPEN|HELD|BOOKED|BLOCKED], blockedReason?,
               meetingRequestId?)   // F9 only; BLOCKED and blockedReason added 23 Nov (0c.11)
AuditEvent(id, actorId?, action, entityType, entityId, ip, userAgent, at, metadata)
```
Removed from v0.2: `tier`, `ProjectGrant`, `rank`, `Acknowledgement` per document (replaced by `Submission`),
teaser fields entered by governments (revenueModel, counterparty, tenderTimeline, feedbackSought, documentsPrepared).

Decisions while building (18 Nov):
- **Upload links (M0):** an `UploadLink` table replaces the earlier `Country.uploadToken` / `uploadTokenExpiresAt`
  fields, so the generic link (no country, the uploader picks one) and revoked or replaced links fit too. Only the
  SHA-256 of the token is stored; the URL is shown once. `Submission.uploadLinkId` names the link used.
- **Every teaser file carries its consent (M1):** `Document.submissionId` is required, so the database refuses a
  teaser without a `Submission`. A teaser uploaded in the portal workspace creates its own `Submission`
  (`uploadLinkId` null, the signed-in user as uploader, same wording and version as the link; an admin uploading
  for a country confirms the government's written consent instead, version `country-upload-ack-v1-on-behalf`).
  `Project.submissionId` is the link submission that created the project. Publishing needs no second tick.
- **Country contacts (M1):** each upload link submission adds the uploader as a `FOCAL_POINT` contact of the
  country unless that address already is one (existing contacts, for example named by WBG, are never changed).
- **Kept outside section 6 for now:** `Project.lat/lon` (for the map, M10). Users and roles (M2), authorisation (M3)
  and meeting requests (M5) are in line.
- **Meeting requests (M5, Sajid 18 Nov):** `MeetingRequest` as section 6 (organisation, role, note; `type`, `rank`,
  `message`, `decidedOnBehalf` removed; an admin's decision on behalf is in the audit event). One open (pending or
  accepted) request per investor and project; decisions are final. The Summit mailbox is told of every request;
  emails to focal points (WBG coordinators in cc) and to investors on decision are built but off
  (`REQUEST_NOTIFY_FOCAL_POINTS`, `REQUEST_NOTIFY_INVESTOR`) until WBG decides. WBG coordinators read and export
  their countries' requests but never decide. Export at `/inbox/export` (formula-injection guard).
- **Auth (M2, Sajid 18 Nov):** `UserRole.WBG_COORDINATOR` added. `User.countryIds[]` is kept as the existing
  `CountryMembership` table (userId, countryId, role FOCAL_POINT|MEMBER; the role means nothing for coordinators).
  New `User.mustChangePassword` (not in section 6): set when an admin hands out a temporary password (0a.4), cleared
  when the person chooses their own. `User.investorAckTextVersion` / `investorAckAcceptedAt` as section 6; investors
  accept it instead of the draft terms, other roles keep the terms. Second step behind `AUTH_SECOND_STEP`
  (`none` now, `totp` kept dormant, email codes later). `Invitation` keeps its v0.2 extras (`membershipRole`,
  `pipelineScope`) until M3; invitations are unused while admins hand out accounts.
- **Authorisation (M3, Sajid 18 Nov), rules of section 4 in `src/lib/authz`:** pipeline scopes (`User` and
  `Invitation.pipelineScope`, `PipelineCountry`), `ProjectGrant`/`GrantScope` and `DocumentKind` EXTRA/DATAROOM are
  removed (migration `m3_authz_v03`). Investors and WBG coordinators see every PUBLISHED project of an ACTIVE country
  (current clean teaser, download unless an admin switched it off); country users see only their own countries'
  projects, any status, and no other country's. Country users only see and decide: create, edit, teaser upload,
  publish and withdraw in the portal are admin-only (M7 admin console). Any user of a country (focal point or
  member) accepts or declines its requests; admins may decide on its behalf. Coordinators read and export their
  own countries' requests (their `CountryMembership` rows) and never decide.

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

**v0.4 work (from section 0b), in this order for the 23 to 24 Nov launch:**

| Order | Milestone | Target |
|---|---|---|
| M11 | Upload link fixes: government organisation (verify), required job title, ack v2 text, all common document and image formats accepted (0b item 4), remove "No account is needed", WBG drop-down vocabularies, Region field | **Sun 22 Nov** (before links go to Jacob) |
| M12 | Country accounts: per-country links and pre-created logins (bulk from Jacob's list), no forced password change for COUNTRY/WBG, several users per country, country view of the full published pipeline + My projects + Meeting requests (authz and tests updated) | Sun 22 Nov |
| M13 | Investor self-registration with pre-approved organisations/contacts, pending approval queue, approver role, organisation type, demand counts for countries | Mon 23 Nov |
| M14 | Admin: several projects from one file, CSV import with WBG columns, metadata review before publish; landing logos (WBG, GCFC, Expo City Dubai/Terra, UNWC 2026; no MoFA); rooms and hours once Smita confirms; email deliverability check | Mon 23 Nov |

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
