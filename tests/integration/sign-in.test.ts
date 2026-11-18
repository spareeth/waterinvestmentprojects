import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PipelineScope, UserRole, UserStatus } from "@/generated/prisma/enums";
import { LOCKOUT_MAX_FAILURES } from "@/lib/auth/constants";
import {
  approveUser,
  confirmEnrolment,
  register,
  signInWithPassword,
  signOut,
  startEnrolment,
  verifySecondStep,
} from "@/lib/auth/service";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { totp } from "../totp";
import {
  actorFor,
  cleanUp,
  CookieJar,
  createUser,
  gate,
  PASSWORD,
  requestHeaders,
  testAuth,
  uniqueEmail,
} from "./helpers";

const auth = testAuth();

beforeAll(cleanUp);
afterAll(cleanUp);

async function signIn(email: string, password = PASSWORD) {
  const jar = new CookieJar();
  const result = await signInWithPassword(
    { email, password },
    requestHeaders(),
    auth,
  );
  if (result.status !== "failed") jar.store(result.headers);
  return { result, jar };
}

function current(jar: CookieJar, now?: Date) {
  return getCurrentSession(jar.headers(), { auth, config: gate, now });
}

async function lastAudit(where: object) {
  return db.auditEvent.findFirst({ where, orderBy: { at: "desc" } });
}

/** Enrols the signed-in user in TOTP and returns the authenticator secret. */
async function enrol(jar: CookieJar, userId: string): Promise<string> {
  const started = await startEnrolment(PASSWORD, jar.headers(), auth);
  if (started.status !== "ok") throw new Error("enrolment did not start");
  const secret = new URL(started.totpURI).searchParams.get("secret") ?? "";
  const confirmed = await confirmEnrolment(
    totp(secret),
    userId,
    jar.headers(),
    auth,
  );
  if (confirmed.status !== "ok") throw new Error("enrolment not confirmed");
  jar.store(confirmed.headers);
  return secret;
}

describe("sign-in with email and password", () => {
  it("records a successful login with the user as actor", async () => {
    const user = await createUser({});
    const { result } = await signIn(user.email);
    expect(result.status).toBe("signed-in");
    const audit = await lastAudit({ action: "auth.login", actorId: user.id });
    expect(audit).toMatchObject({ entityId: user.id, ip: "198.51.100.7" });
  });

  it("records a failed login without an actor", async () => {
    const user = await createUser({});
    const { result } = await signIn(user.email, "wrong-password-123");
    expect(result).toEqual({ status: "failed", reason: "invalid_password" });
    const audit = await lastAudit({
      action: "auth.login_failed",
      metadata: { path: ["email"], equals: user.email },
    });
    expect(audit?.actorId).toBeNull();
    expect(audit?.metadata).toMatchObject({ reason: "invalid_password" });
  });

  it("refuses a deactivated account even with the right password", async () => {
    const user = await createUser({ status: UserStatus.DEACTIVATED });
    const { result } = await signIn(user.email);
    expect(result).toEqual({ status: "failed", reason: "deactivated" });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    const audit = await lastAudit({
      action: "auth.login_failed",
      metadata: { path: ["email"], equals: user.email },
    });
    expect(audit?.actorId).toBeNull();
  });

  it("ends the sessions of an account deactivated while signed in", async () => {
    const user = await createUser({ mfaEnabled: false });
    const { jar } = await signIn(user.email);
    expect(await current(jar)).not.toBeNull();
    await db.user.update({
      where: { id: user.id },
      data: { status: UserStatus.DEACTIVATED },
    });
    expect(await current(jar)).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it(`locks the email after ${LOCKOUT_MAX_FAILURES} failed attempts`, async () => {
    const user = await createUser({});
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      const { result } = await signIn(user.email, `wrong-password-${i}xx`);
      expect(result.status).toBe("failed");
    }
    const { result } = await signIn(user.email);
    expect(result).toEqual({ status: "failed", reason: "locked" });
  });
});

describe("account gate after sign-in", () => {
  it("sends a pending account to the pending screen only", async () => {
    const user = await createUser({ status: UserStatus.PENDING_APPROVAL });
    const { result, jar } = await signIn(user.email);
    expect(result.status).toBe("signed-in");
    expect((await current(jar))?.stage).toBe("pending");
  });

  it("requires two-step enrolment before anything else", async () => {
    const user = await createUser({ termsAccepted: true });
    const { jar } = await signIn(user.email);
    expect((await current(jar))?.stage).toBe("enrol-2fa");
  });

  it("lets the staging switch skip enrolment", async () => {
    const user = await createUser({ termsAccepted: true });
    const { jar } = await signIn(user.email);
    const session = await getCurrentSession(jar.headers(), {
      auth,
      config: { ...gate, secondStep: "none" },
    });
    expect(session?.stage).toBe("active");
  });

  it("asks for the terms after enrolment, then lets the user in", async () => {
    // Investors accept the investor acknowledgement instead (tests/integration/accounts.test.ts).
    const user = await createUser({ role: UserRole.COUNTRY });
    const { jar } = await signIn(user.email);
    await enrol(jar, user.id);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).mfaEnabled,
    ).toBe(true);
    expect((await current(jar))?.stage).toBe("terms");
    await db.user.update({
      where: { id: user.id },
      data: { termsAcceptedAt: new Date() },
    });
    expect((await current(jar))?.stage).toBe("active");
  });

  it("signs out after the idle timeout and after the maximum session age", async () => {
    const user = await createUser({});
    const { jar } = await signIn(user.email);
    const idle = new Date(Date.now() + (gate.idleMinutes + 1) * 60_000);
    expect(await current(jar, idle)).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    const second = await signIn(user.email);
    // Keep the session active, then jump past the absolute limit.
    await db.session.updateMany({
      where: { userId: user.id },
      data: { updatedAt: new Date(Date.now() + 13 * 60 * 60_000) },
    });
    const tooOld = new Date(Date.now() + 13 * 60 * 60_000 + 1000);
    expect(await current(second.jar, tooOld)).toBeNull();
  });
});

describe("two-step verification at sign-in", () => {
  it("creates no session until the second step succeeds", async () => {
    const user = await createUser({});
    const first = await signIn(user.email);
    const secret = await enrol(first.jar, user.id);
    await signOut(user.id, first.jar.headers(), auth);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    const { result, jar } = await signIn(user.email);
    expect(result.status).toBe("second-step");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await current(jar)).toBeNull();

    const wrong = await verifySecondStep(
      { code: "000000", method: "totp" },
      jar.headers(),
      auth,
    );
    expect(wrong).toEqual({ status: "failed", reason: "invalid_code" });
    const failed = await lastAudit({
      action: "auth.login_failed",
      metadata: { path: ["step"], equals: "second_step" },
    });
    expect(failed?.actorId).toBeNull();

    const right = await verifySecondStep(
      { code: totp(secret), method: "totp" },
      jar.headers(),
      auth,
    );
    expect(right.status).toBe("signed-in");
    if (right.status === "signed-in") jar.store(right.headers);
    expect((await current(jar))?.user.id).toBe(user.id);
    const login = await lastAudit({ action: "auth.login", actorId: user.id });
    expect(login?.metadata).toMatchObject({ method: "totp" });
  });
});

describe("self-registration", () => {
  it("is refused while SELF_REGISTRATION_ENABLED is off", async () => {
    const email = uniqueEmail("selfreg-off");
    const result = await register(
      { email, password: PASSWORD, name: "Self Registered", organisation: "X" },
      requestHeaders(),
      auth,
    );
    expect(result).toEqual({ status: "failed", reason: "disabled" });
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("creates a pending investor that sees nothing until approved", async () => {
    const openAuth = testAuth({ SELF_REGISTRATION_ENABLED: "true" });
    const email = uniqueEmail("selfreg-on");
    const result = await register(
      { email, password: PASSWORD, name: "Self Registered", organisation: "X" },
      requestHeaders(),
      openAuth,
    );
    expect(result.status).toBe("ok");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    // A pending account has no pipeline at all; approval gives the investor default.
    expect(user).toMatchObject({
      role: UserRole.INVESTOR,
      status: UserStatus.PENDING_APPROVAL,
      pipelineScope: PipelineScope.NONE,
    });
    const jar = new CookieJar();
    if (result.status === "ok") jar.store(result.headers);
    expect((await current(jar))?.stage).toBe("pending");

    const investor = await actorFor(user.id);
    await expect(
      approveUser(investor, user.id, requestHeaders()),
    ).rejects.toThrow(/Not allowed/);
    const admin = await createUser({ role: UserRole.SUMMIT_ADMIN });
    await approveUser(await actorFor(admin.id), user.id, requestHeaders());
    expect(
      await db.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { status: true, pipelineScope: true },
      }),
    ).toEqual({ status: UserStatus.ACTIVE, pipelineScope: PipelineScope.ALL });
  });

  it("ignores a role or status sent with the sign-up form", async () => {
    const openAuth = testAuth({ SELF_REGISTRATION_ENABLED: "true" });
    const email = uniqueEmail("selfreg-role");
    const attempt = openAuth.api
      .signUpEmail({
        body: {
          email,
          password: PASSWORD,
          name: "Sneaky",
          // Not allowed as input; must be rejected or ignored.
          ...({
            role: UserRole.PLATFORM_ADMIN,
            status: UserStatus.ACTIVE,
          } as object),
        },
        headers: requestHeaders(),
      })
      .catch(() => null);
    await attempt;
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      expect(user.role).toBe(UserRole.INVESTOR);
      expect(user.status).toBe(UserStatus.PENDING_APPROVAL);
    }
  });
});
