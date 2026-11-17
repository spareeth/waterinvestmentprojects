import "server-only";
import { isAPIError } from "better-auth/api";
import { UserStatus } from "@/generated/prisma/enums";
import { requestMetaFrom, writeAudit } from "@/lib/audit";
import { type Actor, canApproveUsers } from "@/lib/authz/account-policies";
import { db } from "@/lib/db";
import { type Auth, getAuth, normaliseEmail } from "./auth";
import { AUTH_AUDIT, AUTH_ERROR } from "./constants";
import { TERMS_VERSION } from "./terms";

// Sign-in steps behind the server actions. Every function takes the request headers explicitly so the same
// code runs in a server action and in integration tests. Cookies are set by Better Auth's nextCookies plugin
// inside a request; tests read them from the returned headers instead.

export type FailureReason =
  "invalid_password" | "deactivated" | "locked" | "invalid_code";

export type SignInResult =
  | { status: "signed-in"; userId: string; headers: Headers }
  | { status: "second-step"; headers: Headers }
  | { status: "failed"; reason: FailureReason };

function errorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const body = error.body as { code?: string } | undefined;
  return body?.code;
}

function signInFailureReason(error: unknown): FailureReason {
  const code = errorCode(error);
  if (code === AUTH_ERROR.LOCKED) return "locked";
  if (code === AUTH_ERROR.DEACTIVATED) return "deactivated";
  return "invalid_password";
}

/** First step: email and password. Writes auth.login or auth.login_failed (actorId empty). */
export async function signInWithPassword(
  input: { email: string; password: string },
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<SignInResult> {
  const email = normaliseEmail(input.email);
  const meta = requestMetaFrom(headers);
  try {
    const result = await auth.api.signInEmail({
      body: { email, password: input.password, rememberMe: true },
      headers,
      returnHeaders: true,
    });
    const data = result.response as
      { twoFactorRedirect?: boolean; user?: { id: string } } | undefined;
    if (data?.twoFactorRedirect) {
      return { status: "second-step", headers: result.headers };
    }
    const userId = data?.user?.id;
    if (!userId) throw new Error("Sign-in returned no user");
    await writeAudit({
      actorId: userId,
      action: AUTH_AUDIT.LOGIN,
      entityType: "User",
      entityId: userId,
      meta,
      metadata: { method: "password" },
    });
    return { status: "signed-in", userId, headers: result.headers };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const reason = signInFailureReason(error);
    await writeAudit({
      actorId: null,
      action: AUTH_AUDIT.LOGIN_FAILED,
      entityType: "User",
      meta,
      metadata: { email, reason, step: "password" },
    });
    return { status: "failed", reason };
  }
}

/** Second step at sign-in: a code from the authenticator app, or one of the backup codes. */
export async function verifySecondStep(
  input: { code: string; method: "totp" | "backup" },
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<SignInResult> {
  const meta = requestMetaFrom(headers);
  const code = input.code.replace(/\s+/g, "");
  try {
    const result =
      input.method === "totp"
        ? await auth.api.verifyTOTP({
            body: { code, trustDevice: false },
            headers,
            returnHeaders: true,
          })
        : await auth.api.verifyBackupCode({
            body: { code, trustDevice: false },
            headers,
            returnHeaders: true,
          });
    const data = result.response as { user?: { id: string } } | undefined;
    const userId = data?.user?.id;
    if (!userId) throw new Error("Second step returned no user");
    await writeAudit({
      actorId: userId,
      action: AUTH_AUDIT.LOGIN,
      entityType: "User",
      entityId: userId,
      meta,
      metadata: { method: input.method === "totp" ? "totp" : "backup_code" },
    });
    return { status: "signed-in", userId, headers: result.headers };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const locked = errorCode(error)?.includes("LOCK");
    await writeAudit({
      actorId: null,
      action: AUTH_AUDIT.LOGIN_FAILED,
      entityType: "User",
      meta,
      metadata: {
        reason: locked ? "locked" : "invalid_code",
        step: "second_step",
        method: input.method,
      },
    });
    return { status: "failed", reason: locked ? "locked" : "invalid_code" };
  }
}

export type EnrolmentStart =
  | { status: "ok"; totpURI: string; backupCodes: string[] }
  | { status: "failed"; reason: "invalid_password" | "already_enrolled" };

/** Enrolment, part one: confirm the password, then get the authenticator secret and backup codes. */
export async function startEnrolment(
  password: string,
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<EnrolmentStart> {
  try {
    const result = await auth.api.enableTwoFactor({
      body: { password },
      headers,
    });
    const data = result as { totpURI?: string; backupCodes?: string[] };
    if (!data.totpURI || !data.backupCodes) {
      throw new Error("Enrolment returned no secret");
    }
    return {
      status: "ok",
      totpURI: data.totpURI,
      backupCodes: data.backupCodes,
    };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = errorCode(error);
    if (code === "TOTP_ALREADY_ENABLED") {
      return { status: "failed", reason: "already_enrolled" };
    }
    return { status: "failed", reason: "invalid_password" };
  }
}

/** Enrolment, part two: the first code from the app switches two-step verification on (User.mfaEnabled). */
export async function confirmEnrolment(
  code: string,
  userId: string,
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<{ status: "ok"; headers: Headers } | { status: "failed" }> {
  try {
    const result = await auth.api.verifyTOTP({
      body: { code: code.replace(/\s+/g, "") },
      headers,
      returnHeaders: true,
    });
    await writeAudit({
      actorId: userId,
      action: AUTH_AUDIT.MFA_ENROL,
      entityType: "User",
      entityId: userId,
      meta: requestMetaFrom(headers),
      metadata: { method: "totp" },
    });
    return { status: "ok", headers: result.headers };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return { status: "failed" };
  }
}

export async function acceptTerms(
  userId: string,
  headers: Headers,
  now: Date = new Date(),
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { termsAcceptedAt: now },
    });
    await writeAudit(
      {
        actorId: userId,
        action: AUTH_AUDIT.TERMS_ACCEPT,
        entityType: "User",
        entityId: userId,
        meta: requestMetaFrom(headers),
        metadata: { termsVersion: TERMS_VERSION },
      },
      tx,
    );
  });
}

export async function signOut(
  userId: string | null,
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<void> {
  try {
    await auth.api.signOut({ headers });
  } catch (error) {
    // No session left to end (already expired or signed out elsewhere): nothing to undo.
    if (!isAPIError(error)) throw error;
  }
  if (userId) {
    await writeAudit({
      actorId: userId,
      action: AUTH_AUDIT.LOGOUT,
      entityType: "User",
      entityId: userId,
      meta: requestMetaFrom(headers),
    });
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  organisation: string;
  jobTitle?: string | null;
}

export type RegisterResult =
  | { status: "ok"; userId: string; headers: Headers }
  | { status: "failed"; reason: "disabled" | "rejected" };

/**
 * Self-registration (off unless SELF_REGISTRATION_ENABLED). Creates an INVESTOR with status PENDING_APPROVAL,
 * who sees only the pending screen until a Summit admin approves. Role and status cannot be set by the form.
 */
export async function register(
  input: RegisterInput,
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<RegisterResult> {
  const email = normaliseEmail(input.email);
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password: input.password,
        name: input.name.trim(),
        organisation: input.organisation.trim(),
        jobTitle: input.jobTitle?.trim() || undefined,
      },
      headers,
      returnHeaders: true,
    });
    const userId = (result.response as { user?: { id: string } }).user?.id;
    if (!userId) throw new Error("Sign-up returned no user");
    await writeAudit({
      actorId: userId,
      action: AUTH_AUDIT.REGISTER,
      entityType: "User",
      entityId: userId,
      meta: requestMetaFrom(headers),
      metadata: { status: UserStatus.PENDING_APPROVAL },
    });
    return { status: "ok", userId, headers: result.headers };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = errorCode(error);
    return {
      status: "failed",
      reason:
        code === "EMAIL_PASSWORD_SIGN_UP_DISABLED" ? "disabled" : "rejected",
    };
  }
}

/** A Summit admin approves a self-registered account. The admin screen arrives in M8. */
export async function approveUser(
  actor: Actor,
  userId: string,
  headers: Headers,
): Promise<void> {
  if (!canApproveUsers(actor)) throw new Error("Not allowed to approve users.");
  await db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, status: UserStatus.PENDING_APPROVAL },
      data: { status: UserStatus.ACTIVE },
    });
    if (updated.count !== 1) throw new Error("No pending account to approve.");
    await writeAudit(
      {
        actorId: actor.id,
        action: AUTH_AUDIT.APPROVE,
        entityType: "User",
        entityId: userId,
        meta: requestMetaFrom(headers),
      },
      tx,
    );
  });
}
