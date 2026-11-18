import { randomUUID } from "node:crypto";
import {
  MembershipRole,
  PipelineScope,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import type { Actor } from "@/lib/authz/account-policies";
import { accountStage, type GateConfig } from "@/lib/authz/account-gate";
import { type Viewer, viewerFrom } from "@/lib/authz/viewer";
import { createAuth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { type Env, parseEnv } from "@/lib/env";

// Shared fixtures for the integration tests. Every row they create uses the reserved "@it.example" domain or an
// "it-" id, and cleanUp() removes it again, so the tests leave the local demo database as they found it.

export const IT_DOMAIN = "it.example";
export const PASSWORD = "Integration-test-pass-1";
export const COUNTRY_ID = "it-country";

/** Environment for the tests, independent of whatever flags the local .env has switched on. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    ...process.env,
    APP_ENV: "development",
    SELF_REGISTRATION_ENABLED: "false",
    AUTH_SKIP_SECOND_STEP: "false",
    SESSION_IDLE_MINUTES: "120",
    SESSION_MAX_HOURS: "12",
    ...overrides,
  });
}

export function testAuth(overrides: Record<string, string> = {}) {
  return createAuth({ env: testEnv(overrides) });
}

export const gate: GateConfig = {
  idleMinutes: 120,
  maxHours: 12,
  skipSecondStep: false,
};

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@${IT_DOMAIN}`;
}

/** Request headers as a browser would send them, optionally with cookies. */
export function requestHeaders(cookie?: string): Headers {
  const h = new Headers({
    "user-agent": "integration-test",
    "x-forwarded-for": "198.51.100.7",
  });
  if (cookie) h.set("cookie", cookie);
  return h;
}

/** A tiny cookie jar: keeps the latest value of every cookie from Set-Cookie responses. */
export class CookieJar {
  private cookies = new Map<string, string>();

  store(response: Headers): this {
    for (const line of response.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((a) =>
        /^\s*max-age=0\s*$/i.test(a.trim()),
      );
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return this;
  }

  headers(): Headers {
    return requestHeaders(
      [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; "),
    );
  }
}

export async function ensureCountry(): Promise<void> {
  await db.country.upsert({
    where: { id: COUNTRY_ID },
    create: { id: COUNTRY_ID, name: "Integration Country", iso3: "XZI" },
    update: {},
  });
}

/** Creates a user with the test password (and optionally a country membership). */
export async function createUser(input: {
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  mfaEnabled?: boolean;
  termsAccepted?: boolean;
  membershipRole?: MembershipRole;
  /** Country for membershipRole; defaults to COUNTRY_ID (which is created on demand). Must exist otherwise. */
  countryId?: string;
  pipelineScope?: PipelineScope;
}): Promise<{ id: string; email: string }> {
  const auth = testAuth();
  const email = input.email ?? uniqueEmail("user");
  const hash = await (await auth.$context).password.hash(PASSWORD);
  const user = await db.user.create({
    data: {
      email,
      name: "Integration Tester",
      role: input.role ?? UserRole.INVESTOR,
      status: input.status ?? UserStatus.ACTIVE,
      mfaEnabled: input.mfaEnabled ?? false,
      termsAcceptedAt: input.termsAccepted ? new Date() : null,
      pipelineScope: input.pipelineScope ?? PipelineScope.NONE,
      emailVerified: true,
    },
    select: { id: true, email: true },
  });
  // Better Auth finds the password through the credential account whose accountId is the user id.
  await db.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hash,
    },
  });
  if (input.membershipRole) {
    if (!input.countryId) await ensureCountry();
    await db.countryMembership.create({
      data: {
        userId: user.id,
        countryId: input.countryId ?? COUNTRY_ID,
        role: input.membershipRole,
      },
    });
  }
  return user;
}

/** The Viewer the policy module would build for this user's session (null unless the account is active). */
export async function viewerFor(userId: string): Promise<Viewer | null> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      mfaEnabled: true,
      termsAcceptedAt: true,
      pipelineScope: true,
      memberships: { select: { countryId: true, role: true } },
      pipelineCountries: { select: { countryId: true } },
    },
  });
  return viewerFrom({
    stage: accountStage(user, gate),
    user: {
      id: user.id,
      role: user.role,
      memberships: user.memberships,
      pipelineScope: user.pipelineScope,
      pipelineCountryIds: user.pipelineCountries.map((p) => p.countryId),
    },
  });
}

export async function actorFor(userId: string): Promise<Actor> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      memberships: { select: { countryId: true, role: true } },
    },
  });
  return user;
}

/** Removes everything the integration tests created. */
export async function cleanUp(): Promise<void> {
  const users = await db.user.findMany({
    where: { email: { endsWith: `@${IT_DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Project data hanging off the "it-" countries and rooms, children first.
  const itProject = { countryId: { startsWith: "it-" } };
  await db.slot.deleteMany({ where: { roomId: { startsWith: "it-" } } });
  await db.room.deleteMany({ where: { id: { startsWith: "it-" } } });
  await db.meetingRequest.deleteMany({
    where: { OR: [{ project: itProject }, { requesterId: { in: ids } }] },
  });
  await db.projectGrant.deleteMany({
    where: { OR: [{ project: itProject }, { userId: { in: ids } }] },
  });
  // Upload links (M0) and submissions: for "it-" countries, created by integration test users, or (portal
  // uploads, M1) sent by an integration test user.
  const itLink = {
    OR: [{ countryId: { startsWith: "it-" } }, { createdById: { in: ids } }],
  };
  const itSubmission = {
    OR: [
      { countryId: { startsWith: "it-" } },
      { uploadLink: itLink },
      { uploaderEmail: { endsWith: `@${IT_DOMAIN}` } },
    ],
  };
  await db.document.deleteMany({
    where: { OR: [{ project: itProject }, { submission: itSubmission }] },
  });
  await db.project.deleteMany({
    where: { OR: [itProject, { submission: itSubmission }] },
  });
  await db.submission.deleteMany({ where: itSubmission });
  await db.uploadLink.deleteMany({ where: itLink });
  // Contacts made from test uploaders (M1); contacts of "it-" countries go with the country.
  await db.countryContact.deleteMany({
    where: { email: { endsWith: `@${IT_DOMAIN}` } },
  });
  await db.auditEvent.deleteMany({
    where: {
      OR: [
        { actorId: { in: ids } },
        { entityId: { in: ids } },
        { entityId: { startsWith: "it-" } },
        { metadata: { path: ["email"], string_ends_with: `@${IT_DOMAIN}` } },
        { userAgent: "integration-test" },
      ],
    },
  });
  await db.invitation.deleteMany({
    where: {
      OR: [
        { email: { endsWith: `@${IT_DOMAIN}` } },
        { invitedById: { in: ids } },
      ],
    },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.country.deleteMany({ where: { id: { startsWith: "it-" } } });
}
