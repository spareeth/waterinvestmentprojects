# Water Investment Summit Secure Project Portal

Invitation-only data room for the Water Investment Summit (9 December 2026, Abu Dhabi). Built and hosted by Terra, Expo City Dubai.

Scope, roles, architecture and milestones: [docs/PLAN.md](docs/PLAN.md). Rules for contributors (human or AI): [CLAUDE.md](CLAUDE.md).

## Stack

Next.js 16 (App Router, TypeScript strict), Tailwind CSS 4 + shadcn/ui, Prisma 7 + PostgreSQL 16, Better Auth 1.7 (email + password, TOTP two-step verification), Vitest + Testing Library, Playwright, GitHub Actions.

## Local setup

Requirements: Node.js 24, npm 11, Docker Desktop (for PostgreSQL).

```bash
cp .env.example .env # then set BETTER_AUTH_SECRET, e.g. openssl rand -base64 32
npm install          # also generates the Prisma client
npm run db:up        # starts PostgreSQL 16 on localhost:5432
npm run db:migrate   # applies migrations
npm run db:seed      # loads fictional demo data (safe to re-run)
npm run dev          # http://localhost:3000
```

Local and staging use fictional seed data only. Never load real country data outside production.

### Seed data

`npm run db:seed` loads Countries A to E, 10 fictional projects (7 published, 2 draft, 1 withdrawn), placeholder teaser PDFs, demo users for every role (emails on the reserved `.example` domain), memberships, acknowledgements, meeting requests in every status, two bilateral rooms with 30-minute slots (8 Dec, and the morning of 9 Dec) and one project grant for extra material. Every row has a fixed `seed-` id and is upserted, so re-running it is safe. The placeholder PDFs are also written to `.data/blobs/` (git-ignored).

The seed refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` (staging only). The data lives in `prisma/seed/data.ts`; `tests/unit/seed-data.test.ts` checks its shape without a database.

### Demo sign-in (local and staging only)

Every seed user signs in with the same demo password:

- **Local:** `Local-demo-only-2026` (or `SEED_DEMO_PASSWORD` if you set one).
- **Staging:** the seed refuses to run without `SEED_DEMO_PASSWORD`; the value is kept in the staging server's `.env` and shared with the demo team only. Never reuse it anywhere else.

| Email                           | Role                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `platform.admin@demo.example`   | Platform admin (Terra)                                       |
| `summit.admin@demo.example`     | Summit admin                                                 |
| `focal@country-a.example`       | Country A focal point                                        |
| `member@country-a.example`      | Country A member                                             |
| `focal@country-b.example`       | Country B focal point                                        |
| `member@country-b.example`      | Country B member                                             |
| `focal@country-c.example`       | Country C focal point                                        |
| `investor@operator-one.example` | Investor (also `fund-two`, `bank-three`, `developer-four`)   |
| `applicant@fund-five.example`   | Investor waiting for approval (sees only the pending screen) |
| `former@operator-six.example`   | Deactivated investor (cannot sign in)                        |

At first sign-in each user sets up an authenticator app (Microsoft Authenticator, Google Authenticator or similar) and accepts the terms. Re-running the seed resets demo users' two-step setup and signs them out.

Two seed invitations are still open, for trying the invitation flow locally: `/invitation/seed-invitation-investor-7` (investor) and `/invitation/seed-invitation-country-c-member` (Country C member). Their tokens are not secret, so treat them as used once staging is shared.

## Sign-in and accounts (M3)

- **Invitation only.** An invitation holds the email, role and, for country users, the country and membership role (focal point or member). Only the SHA-256 of the link token is stored; links expire (7 days by default) and work once, even if clicked twice at the same moment. Accepting creates the account, the password and the country membership. Focal points can invite members of their own country; admins invite anyone. No email is sent yet (provider not decided), so invitation links come from `createInvitation()` and the admin console in M8.
- **Two-step verification is mandatory.** After the password, every account must set up an authenticator app (TOTP, with 10 single-use backup codes) before anything else; later sign-ins ask for the code. Then the terms of use (draft wording, version recorded in the audit log).
- **Account gate.** `src/lib/authz` decides where a signed-in person may go: pending approval (pending screen only), two-step enrolment, terms, then the portal. Every signed-in page and server action starts with `requireStage()` or `requireActiveUser()`.
- **Deactivated accounts** cannot sign in, and their open sessions end on the next request.
- **Session timeout:** `SESSION_IDLE_MINUTES` without activity (default 120) and `SESSION_MAX_HOURS` after sign-in (default 12).
- **Lockout and rate limits:** 5 failed sign-ins for one email within 15 minutes lock that email for the rest of the 15 minutes (counted from the audit log). Each sign-in action is also limited per IP address. Wrong two-step codes lock the second step for a while.
- **Audit:** `auth.login`, `auth.login_failed` (no actor, with the email and reason), `auth.logout`, `auth.session_expired`, `auth.mfa_enrol`, `user.terms_accept`, `user.register`, `user.approve`, `invitation.create`, `invitation.accept`.
- **Self-registration** is built but off (`SELF_REGISTRATION_ENABLED=false`). When on, `/register` creates investor accounts with status PENDING_APPROVAL that see nothing until a Summit admin approves them (`approveUser()`; screen in M8).
- **Demo switch:** `AUTH_SKIP_SECOND_STEP=true` makes enrolment optional for a local or staging demo (already enrolled users are still asked for a code). The server refuses to start with it when `APP_ENV=production`. Staging runs a production build, so staging must set `APP_ENV=staging`; when `APP_ENV` is missing on a production build it counts as production.
- `APP_URL` must be the exact public address (scheme, host and port): sign-in cookies and invitation links use it.

There is no HTTP endpoint for Better Auth: every sign-in step is a server action that calls it directly. Password reset needs the email provider and is not built yet; until then the Summit team re-invites people who lose access.

## Country workspace (M5)

- **My projects** (`/workspace`): country users manage their own country's projects; Summit and platform admins manage every country's. Investors have no workspace. Members add and edit drafts and upload teasers; the focal point (or an admin on the country's behalf) publishes, withdraws and changes published projects.
- **Teasers:** PDF only (checked by content, not the file name), up to 25 MB. Each upload is a new version with its SHA-256; the previous version is linked to it through `supersededById`, and only the current version is shown to investors. View only by default; download can be switched on per teaser.
- **Confidentiality acknowledgement:** publishing needs the tick box every time; it is stored as an `Acknowledgement` on the current clean teaser (user, time, IP, wording version) inside the same transaction as the publish. Uploading a new version to a published project needs the tick too. Admins acting for a country must add an evidence note (where the country's written confirmation is kept).
- **Files** live in a private store behind `src/lib/storage` (`STORAGE_DRIVER=local`: `.data/blobs/`, git-ignored; S3-compatible storage in M10). They are only served by `/files/<id>` after the policy module allows it, with private no-store headers.
- **Virus scan:** ClamAV arrives in M10. Until then `UPLOAD_SCAN=pending` (default) keeps uploads PENDING, so they cannot be opened or published; `UPLOAD_SCAN=assume-clean` marks them clean at once for local and staging demos, and the audit log records that no scanner ran. The server refuses to start with `assume-clean` when `APP_ENV=production`.
- **Audit:** `project.create`, `project.update`, `project.publish`, `project.withdraw`, `project.view`, `document.upload`, `document.scan`, `document.update`, `acknowledgement.create`, plus `document.view` / `document.download` / `access.denied` from the file route.

## Teaser upload link (M0, PLAN v0.3 F0)

- **Links** (`/admin/upload-links`, Summit and platform admins): one link per country, `/submit/<token>`, where the token fixes the country; plus one generic link where the uploader picks an active country. 32 random bytes; only the SHA-256 is stored (`UploadLink.tokenHash`), so the URL is shown once, when created. Each link expires (default 30 Nov 2026, end of day UAE time) and can be revoked; creating a new link for a country revokes the old one. A link stops working when its country is set inactive.
- **Upload page** (`/submit/<token>`, no account, no two-step): country, uploader name and email, 1 to 5 teasers (sector drop-down and a PDF or PowerPoint `.pptx` file each, checked by content, max 25 MB each, 60 MB together) and one acknowledgement with WBG's exact wording from `src/lib/config.ts` (`uploadAcknowledgement`, text and version change together). Rate limited per IP (opening and submitting); every opening and refused token is audited.
- **On submit:** one transaction stores a `Submission` (uploader, `ackTextVersion`, `ackAcceptedAt`, IP) and per teaser a DRAFT `Project` (`submissionId`, name from the file name, sector, no tier) with `Document` version 1 (`allowDownload` true, `uploadedById` empty). Files go to `submissions/<uuid>/<uuid>.<pdf|pptx>` in the private store and are removed again if the transaction fails.
- **After submit:** the uploader sees a confirmation page (reference, time, files, the consent they gave) and gets the same by email from the Summit mailbox; the Summit mailbox (`ADMIN_NOTIFY_EMAIL`) gets a notice. Admins also see new submissions on their home page and `/admin/submissions` (counts, "New" for the last 24 hours), so nothing depends on email arriving. The page only says an email was sent when an SMTP server really accepted it.
- **Submissions** (`/admin/submissions`, admins only): every submission with its teasers; downloads go through `/files/<id>?download=1` and the policy module. Until a virus scanner runs, admins (only) may download files whose scan is still pending; the download is audited with the scan status. PowerPoint files are always served as downloads.
- **Audit:** `upload_link.create`, `upload_link.revoke`, `upload_link.open`, `upload_link.refused`, `submission.create`, `submission.list`, `project.create`, `document.upload`, `document.scan`, `mail.sent`, `mail.failed`.

## Email

- Sent from the Summit mailbox (`MAIL_FROM`, e.g. summit@waterinvestmentprojects.org) through `src/lib/mail`: `sendMail()` for one message, `notifySummitTeam()` for notices to `ADMIN_NOTIFY_EMAIL` (teaser submissions now; new projects and meeting requests later). Both run after the transaction has committed and never throw; every send is audited (`mail.sent` / `mail.failed`, never the body).
- `MAIL_DRIVER=log` (default) writes emails to the server log. `MAIL_DRIVER=smtp` sends through `SMTP_HOST` / `SMTP_PORT` (587 with STARTTLS, or 465 with `SMTP_SECURE=true`) / `SMTP_USER` / `SMTP_PASSWORD`; works with Microsoft 365, Google Workspace or Zoho. The password lives only in the server's root-only `.env`.
- The inbox is read at the mail provider (Outlook or webmail), not in the portal. The domain needs MX, SPF, DKIM and DMARC records so emails are not marked as spam.
- **Local test inbox:** `npm run mail:up` starts Mailpit; set `MAIL_DRIVER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `MAIL_FROM=summit@waterinvestmentprojects.org`, `ADMIN_NOTIFY_EMAIL=summit@waterinvestmentprojects.org` in `.env` and read every email at http://localhost:8025. Nothing leaves your machine.

## Scripts

| Script                            | Purpose                             |
| --------------------------------- | ----------------------------------- |
| `npm run dev`                     | Development server                  |
| `npm run build` / `npm start`     | Production build and server         |
| `npm run lint`                    | ESLint                              |
| `npm run typecheck`               | TypeScript, no emit                 |
| `npm run format` / `format:check` | Prettier                            |
| `npm test`                        | Unit and integration tests (Vitest) |
| `npm run test:e2e`                | End-to-end tests (Playwright)       |
| `npm run db:up` / `db:down`       | Start or stop local PostgreSQL      |
| `npm run db:migrate`              | Create and apply a migration (dev)  |
| `npm run db:seed`                 | Load fictional demo data            |
| `npm run db:studio`               | Prisma Studio                       |

`npm test` runs two Vitest projects: `unit` (jsdom, no database) and `integration` (real PostgreSQL from `DATABASE_URL`, migrations applied). Integration tests create users on `@it.example` and remove them afterwards.

First Playwright run: `npx playwright install chromium`. The end-to-end tests start a dev server and use the database; to keep port 3000 free for something else, run them on another port with a matching `APP_URL`:

```bash
PORT=3123 APP_URL=http://localhost:3123 npm run test:e2e
```

## Layout

```
prisma/              schema, migrations and seed (prisma/seed/ holds the demo data)
src/app/             routes (App Router): (auth) signed-out screens, (account) enrolment/terms/pending, (portal) signed-in
src/components/auth/ sign-in, invitation, two-step and terms forms
src/components/ui/   shadcn/ui components
src/lib/auth/        Better Auth set-up, sign-in services, invitations, session, lockout, rate limits
src/lib/authz/       policy module: account gate and account policies (data permissions from M4)
src/lib/             other server utilities (env, db, audit)
tests/unit/          unit test helpers
tests/integration/   Vitest tests against PostgreSQL
tests/e2e/           Playwright specs and their fixtures
```

## Secrets

`.env.example` lists every variable. Real values for staging and production live only on the server, in a root-only `.env` file. Never commit `.env`. `BETTER_AUTH_SECRET` must be different in every environment; changing it signs everyone out and invalidates two-step setups.
