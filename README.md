# Water Investment Summit Secure Project Portal

Invitation-only data room for the Water Investment Summit (9 December 2026, Abu Dhabi). Built and hosted by Terra, Expo City Dubai.

Scope, roles, architecture and milestones: [docs/PLAN.md](docs/PLAN.md). Rules for contributors (human or AI): [CLAUDE.md](CLAUDE.md).

## Stack

Next.js 16 (App Router, TypeScript strict), Tailwind CSS 4 + shadcn/ui, Prisma 7 + PostgreSQL 16, Vitest + Testing Library, Playwright, GitHub Actions.

## Local setup

Requirements: Node.js 24, npm 11, Docker Desktop (for PostgreSQL).

```bash
cp .env.example .env
npm install          # also generates the Prisma client
npm run db:up        # starts PostgreSQL 16 on localhost:5432
npm run db:migrate   # applies migrations
npm run db:seed      # loads fictional demo data (safe to re-run)
npm run dev          # http://localhost:3000
```

Local and staging use fictional seed data only. Never load real country data outside production.

### Seed data

`npm run db:seed` loads Countries A to E, 10 fictional projects (7 published, 2 draft, 1 withdrawn), placeholder teaser PDFs, demo users for every role (emails on the reserved `.example` domain), memberships, acknowledgements, meeting requests in every status, two bilateral rooms with 30-minute slots (8 Dec, and the morning of 9 Dec) and one project grant for extra material. Every row has a fixed `seed-` id and is upserted, so re-running it is safe. The placeholder PDFs are also written to `.data/blobs/` (git-ignored). Demo passwords arrive with sign-in in M3.

The seed refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` (staging only). The data lives in `prisma/seed/data.ts`; `tests/unit/seed-data.test.ts` checks its shape without a database.

## Scripts

| Script                            | Purpose                            |
| --------------------------------- | ---------------------------------- |
| `npm run dev`                     | Development server                 |
| `npm run build` / `npm start`     | Production build and server        |
| `npm run lint`                    | ESLint                             |
| `npm run typecheck`               | TypeScript, no emit                |
| `npm run format` / `format:check` | Prettier                           |
| `npm test`                        | Unit tests (Vitest)                |
| `npm run test:e2e`                | End-to-end tests (Playwright)      |
| `npm run db:up` / `db:down`       | Start or stop local PostgreSQL     |
| `npm run db:migrate`              | Create and apply a migration (dev) |
| `npm run db:seed`                 | Load fictional demo data           |
| `npm run db:studio`               | Prisma Studio                      |

First Playwright run: `npx playwright install chromium`.

## Layout

```
prisma/              schema, migrations and seed (prisma/seed/ holds the demo data)
src/app/             routes (App Router)
src/components/ui/   shadcn/ui components
src/lib/             server utilities (env, db; authz from M4)
tests/unit/          unit test helpers
tests/e2e/           Playwright specs
```

## Secrets

`.env.example` lists every variable. Real values for staging and production live only on the server, in a root-only `.env` file. Never commit `.env`.
