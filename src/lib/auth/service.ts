import "server-only";
import { isAPIError } from "better-auth/api";
import { type OrganisationType, UserStatus } from "@/generated/prisma/enums";
import { requestMetaFrom, writeAudit } from "@/lib/audit";
import { type Actor, canApproveUsers } from "@/lib/authz/account-policies";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { type Mailer, notifySummitTeam, sendMail } from "@/lib/mail";
import { type Auth, getAuth, normaliseEmail } from "./auth";
import { AUTH_AUDIT, AUTH_ERROR } from "./constants";
import {
  describeMatch,
  type PreApprovedList,
  preApprovalMatch,
} from "./pre-approval";
import {
  registrationNotice,
  registrationOutcomeEmail,
} from "./registration-emails";
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
  /** M13 (PLAN v0.4 0b.16, 0b.17). */
  organisationType: OrganisationType;
  jobTitle: string;
}

export type RegisterResult =
  | {
      status: "ok";
      userId: string;
      headers: Headers;
      /** ACTIVE when a pre-approved registrant got immediate access, otherwise PENDING_APPROVAL. */
      accountStatus: UserStatus;
    }
  | { status: "failed"; reason: "disabled" | "rejected" };

export interface RegisterOptions {
  auth?: Auth;
  /** Defaults to REGISTRATION_AUTO_APPROVE. */
  autoApprove?: boolean;
  mailer?: Mailer;
  summitEmails?: string[];
}

/** The pre-approved list as the matching rules need it. */
export async function loadPreApprovedList(): Promise<PreApprovedList> {
  const [contacts, organisations] = await Promise.all([
    db.approvedContact.findMany({
      select: { email: true, organisation: { select: { name: true } } },
    }),
    db.approvedOrganisation.findMany({
      select: { name: true, emailDomains: true },
    }),
  ]);
  return {
    contacts: contacts.map((c) => ({
      email: c.email,
      organisationName: c.organisation?.name ?? null,
    })),
    organisations,
  };
}

/**
 * Investor and operator self-registration (M13, PLAN v0.4 0b.17 to 0b.21; off when SELF_REGISTRATION_ENABLED
 * is "false"). Creates an INVESTOR who waits for a Summit admin (PENDING_APPROVAL, nothing visible but the
 * pending screen). A registrant on the pre-approved list gets immediate access only with REGISTRATION_AUTO_APPROVE;
 * otherwise the match is shown to the approver. Role and status are never taken from the form. After the commit
 * the Summit mailbox is told; a mail failure is audited and never undoes the registration.
 */
export async function register(
  input: RegisterInput,
  headers: Headers,
  options: RegisterOptions = {},
): Promise<RegisterResult> {
  const auth = options.auth ?? getAuth();
  const email = normaliseEmail(input.email);
  const meta = requestMetaFrom(headers);
  let result;
  try {
    result = await auth.api.signUpEmail({
      body: {
        email,
        password: input.password,
        name: input.name.trim(),
        organisation: input.organisation.trim(),
        jobTitle: input.jobTitle.trim(),
      },
      headers,
      returnHeaders: true,
    });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = errorCode(error);
    return {
      status: "failed",
      reason:
        code === "EMAIL_PASSWORD_SIGN_UP_DISABLED" ? "disabled" : "rejected",
    };
  }
  const userId = (result.response as { user?: { id: string } }).user?.id;
  if (!userId) throw new Error("Sign-up returned no user");

  const match = preApprovalMatch(email, await loadPreApprovedList());
  const autoApprove =
    (options.autoApprove ?? getEnv().REGISTRATION_AUTO_APPROVE) &&
    match !== null;
  const accountStatus = autoApprove
    ? UserStatus.ACTIVE
    : UserStatus.PENDING_APPROVAL;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { organisationType: input.organisationType, status: accountStatus },
    });
    await writeAudit(
      {
        actorId: userId,
        action: AUTH_AUDIT.REGISTER,
        entityType: "User",
        entityId: userId,
        meta,
        metadata: {
          status: accountStatus,
          organisationType: input.organisationType,
          preApproval: match ? match.kind : null,
        },
      },
      tx,
    );
    if (autoApprove) {
      await writeAudit(
        {
          actorId: null,
          action: AUTH_AUDIT.AUTO_APPROVE,
          entityType: "User",
          entityId: userId,
          meta,
          metadata: { match: describeMatch(match) },
        },
        tx,
      );
    }
  });

  await notifySummitTeam(
    "registration.summit_notice",
    registrationNotice({
      name: input.name.trim(),
      email,
      organisation: input.organisation.trim(),
      organisationType: input.organisationType,
      jobTitle: input.jobTitle.trim(),
      match,
      approved: autoApprove,
    }),
    {
      mailer: options.mailer,
      meta,
      entityType: "User",
      entityId: userId,
      recipients: options.summitEmails,
    },
  );
  return { status: "ok", userId, headers: result.headers, accountStatus };
}

export class RegistrationDecisionError extends Error {
  constructor(public readonly code: "forbidden" | "not_pending") {
    super(
      code === "forbidden"
        ? "Not allowed to decide registrations."
        : "This registration has already been decided.",
    );
    this.name = "RegistrationDecisionError";
  }
}

/**
 * A Summit or platform admin approves or rejects a registration that is waiting (M13, PLAN v0.4 0b.19). Only a
 * PENDING_APPROVAL account changes, once: approval makes it ACTIVE (what it then sees follows from its role: every
 * investor sees every published teaser after the investor acknowledgement), rejection makes it REJECTED (it keeps
 * seeing only the pending screen). Audited. The registrant is emailed the outcome only with
 * REGISTRATION_NOTIFY_REGISTRANT; until then the Summit team tells them personally.
 */
export async function decideRegistration(
  actor: Actor,
  userId: string,
  decision: "approve" | "reject",
  headers: Headers,
  options: { mailer?: Mailer; notifyRegistrant?: boolean } = {},
): Promise<void> {
  if (!canApproveUsers(actor)) {
    throw new RegistrationDecisionError("forbidden");
  }
  const meta = requestMetaFrom(headers);
  const status =
    decision === "approve" ? UserStatus.ACTIVE : UserStatus.REJECTED;
  const user = await db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, status: UserStatus.PENDING_APPROVAL },
      data: { status },
    });
    if (updated.count !== 1) {
      throw new RegistrationDecisionError("not_pending");
    }
    await writeAudit(
      {
        actorId: actor.id,
        action: decision === "approve" ? AUTH_AUDIT.APPROVE : AUTH_AUDIT.REJECT,
        entityType: "User",
        entityId: userId,
        meta,
      },
      tx,
    );
    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
  });
  if (options.notifyRegistrant ?? getEnv().REGISTRATION_NOTIFY_REGISTRANT) {
    await sendMail(
      `registration.${decision === "approve" ? "approved" : "rejected"}`,
      { to: [user.email], ...registrationOutcomeEmail(user.name, decision) },
      { mailer: options.mailer, meta, entityType: "User", entityId: userId },
    );
  }
}

/** Kept for callers from before M13. */
export async function approveUser(
  actor: Actor,
  userId: string,
  headers: Headers,
): Promise<void> {
  await decideRegistration(actor, userId, "approve", headers, {
    notifyRegistrant: false,
  });
}
