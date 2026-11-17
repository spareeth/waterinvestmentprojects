import { randomUUID } from "node:crypto";
import { MembershipRole, UserRole, UserStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/authz/account-policies";
import type { GateConfig } from "@/lib/authz/account-gate";
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
    await ensureCountry();
    await db.countryMembership.create({
      data: {
        userId: user.id,
        countryId: COUNTRY_ID,
        role: input.membershipRole,
      },
    });
  }
  return user;
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
  await db.auditEvent.deleteMany({
    where: {
      OR: [
        { actorId: { in: ids } },
        { entityId: { in: ids } },
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
  await db.country.deleteMany({ where: { id: COUNTRY_ID } });
}
