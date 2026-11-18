import "server-only";
import {
  CountryContactRole,
  MembershipRole,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  accountShapeError,
  canCreateAccount,
  canManageAccounts,
  canResetPassword,
  defaultPipelineScope,
} from "@/lib/authz/account-policies";
import { userWhere } from "@/lib/authz/people";
import type { Viewer } from "@/lib/authz/viewer";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { type Auth, getAuth, normaliseEmail } from "./auth";
import { AUTH_AUDIT, MIN_PASSWORD_LENGTH } from "./constants";
import { generateTemporaryPassword } from "./temporary-password";

// M2 (PLAN 0a.4): accounts are handed out by admins. An admin creates the account with a generated temporary
// password, passes the email and password on personally, and the person must choose their own password at first
// sign-in. No invitation emails. Admins can also issue a new temporary password (forgotten password), because
// there is no email reset yet. Every permission decision is in src/lib/authz/account-policies.ts.

export type AccountErrorCode =
  "forbidden" | "invalid" | "exists" | "not_found" | "same_password";

export class AccountError extends Error {
  constructor(
    public readonly code: AccountErrorCode,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(`Account change refused: ${code}`);
    this.name = "AccountError";
  }
}

export const ACCOUNT_MESSAGES: Record<AccountErrorCode, string> = {
  forbidden: "You are not allowed to do this.",
  invalid: "Please check the details and try again.",
  exists: "An account already exists for this email address.",
  not_found: "This account no longer exists.",
  same_password: "Choose a new password, not the temporary one you were given.",
};

export interface CreateAccountInput {
  email: string;
  name: string;
  organisation?: string | null;
  jobTitle?: string | null;
  role: UserRole;
  countryIds: string[];
}

interface Options {
  auth?: Auth;
  now?: Date;
}

async function hashPassword(password: string, auth: Auth): Promise<string> {
  return (await auth.$context).password.hash(password);
}

/** Contact role that matches an account role, for linking CountryContact.userId. */
function contactRoleFor(role: UserRole): CountryContactRole | null {
  if (role === UserRole.COUNTRY) return CountryContactRole.FOCAL_POINT;
  if (role === UserRole.WBG_COORDINATOR) {
    return CountryContactRole.WBG_COORDINATOR;
  }
  return null;
}

/**
 * Creates an ACTIVE account with a temporary password and returns that password (shown to the admin once, never
 * stored or logged). Country users become focal points of their countries; WBG coordinators get membership rows
 * for theirs. Matching country contacts (same email, same country, matching role) are linked to the new user.
 */
export async function createAccount(
  actor: Viewer | null,
  input: CreateAccountInput,
  meta?: RequestMeta,
  options: Options = {},
): Promise<{ userId: string; email: string; temporaryPassword: string }> {
  const email = normaliseEmail(input.email);
  const countryIds = [...new Set(input.countryIds)];
  const request = { role: input.role, countryIds };
  const shape = accountShapeError(request);
  if (shape) throw new AccountError("invalid", { countryIds: shape });
  if (!actor || !canCreateAccount(actor, request)) {
    throw new AccountError("forbidden");
  }
  if (countryIds.length > 0) {
    const found = await db.country.count({ where: { id: { in: countryIds } } });
    if (found !== countryIds.length) {
      throw new AccountError("invalid", {
        countryIds: "One of the countries no longer exists.",
      });
    }
  }

  const auth = options.auth ?? getAuth();
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword, auth);
  const contactRole = contactRoleFor(input.role);

  const created = await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new AccountError("exists", { email: ACCOUNT_MESSAGES.exists });
    }

    const user = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        organisation: input.organisation?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        role: input.role,
        status: UserStatus.ACTIVE,
        // The admin knows the person and hands the details over personally.
        emailVerified: true,
        mustChangePassword: true,
        pipelineScope: defaultPipelineScope(input.role),
      },
      select: { id: true, email: true },
    });
    // Better Auth finds the password through the credential account whose accountId is the user id.
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
    if (countryIds.length > 0) {
      await tx.countryMembership.createMany({
        data: countryIds.map((countryId) => ({
          userId: user.id,
          countryId,
          // v0.3 roles: every country user is a focal point. The membership role means nothing for coordinators.
          role:
            input.role === UserRole.COUNTRY
              ? MembershipRole.FOCAL_POINT
              : MembershipRole.MEMBER,
        })),
      });
    }
    const linked = contactRole
      ? await tx.countryContact.updateMany({
          where: {
            email,
            role: contactRole,
            countryId: { in: countryIds },
            userId: null,
          },
          data: { userId: user.id },
        })
      : { count: 0 };
    await writeAudit(
      {
        actorId: actor.id,
        action: AUTH_AUDIT.ACCOUNT_CREATE,
        entityType: "User",
        entityId: user.id,
        meta,
        metadata: {
          email,
          role: input.role,
          countryIds,
          linkedContacts: linked.count,
          via: "admin_temporary_password",
        },
      },
      tx,
    );
    return user;
  });

  return { userId: created.id, email: created.email, temporaryPassword };
}

/**
 * Issues a new temporary password (forgotten password). Ends the person's sessions and removes any
 * authenticator they set up, so the admin's hand-over is the only way back in; they choose a new password at
 * the next sign-in.
 */
export async function resetTemporaryPassword(
  actor: Viewer | null,
  userId: string,
  meta?: RequestMeta,
  options: Options = {},
): Promise<{ email: string; temporaryPassword: string }> {
  const target = await db.user.findFirst({
    where: { AND: [{ id: userId }, userWhere(actor)] },
    select: { id: true, role: true, email: true, mfaEnabled: true },
  });
  if (!target) throw new AccountError("not_found");
  if (!actor || !canResetPassword(actor, target)) {
    throw new AccountError("forbidden");
  }
  const auth = options.auth ?? getAuth();
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword, auth);

  await db.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { userId: target.id, providerId: "credential" },
      data: { password: passwordHash },
    });
    if (updated.count === 0) {
      await tx.account.create({
        data: {
          userId: target.id,
          accountId: target.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
    }
    await tx.user.update({
      where: { id: target.id },
      data: { mustChangePassword: true, mfaEnabled: false },
    });
    await tx.twoFactor.deleteMany({ where: { userId: target.id } });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await writeAudit(
      {
        actorId: actor.id,
        action: AUTH_AUDIT.PASSWORD_RESET,
        entityType: "User",
        entityId: target.id,
        meta,
        metadata: { authenticatorRemoved: target.mfaEnabled },
      },
      tx,
    );
  });
  return { email: target.email, temporaryPassword };
}

/**
 * First sign-in after a hand-out: the person replaces the temporary password with their own. Their other
 * sessions end; the current one carries on to the next step of the account gate.
 */
export async function changeTemporaryPassword(
  userId: string,
  currentSessionId: string,
  newPassword: string,
  meta?: RequestMeta,
  options: Options = {},
): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 128) {
    throw new AccountError("invalid");
  }
  const auth = options.auth ?? getAuth();
  const context = await auth.$context;
  const account = await db.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true, password: true },
  });
  if (!account?.password) throw new AccountError("not_found");
  const same = await context.password.verify({
    hash: account.password,
    password: newPassword,
  });
  if (same) {
    throw new AccountError("same_password", {
      password: ACCOUNT_MESSAGES.same_password,
    });
  }
  const passwordHash = await context.password.hash(newPassword);
  await db.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: userId, mustChangePassword: true },
      data: { mustChangePassword: false },
    });
    if (changed.count !== 1) throw new AccountError("forbidden");
    await tx.account.update({
      where: { id: account.id },
      data: { password: passwordHash },
    });
    await tx.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    await writeAudit(
      {
        actorId: userId,
        action: AUTH_AUDIT.PASSWORD_CHANGE,
        entityType: "User",
        entityId: userId,
        meta,
        metadata: { reason: "temporary_password" },
      },
      tx,
    );
  });
}

/** An investor accepts the current investor acknowledgement (config wording and version). */
export async function acceptInvestorAcknowledgement(
  userId: string,
  meta?: RequestMeta,
  now: Date = new Date(),
): Promise<void> {
  const { version } = appConfig.investorAcknowledgement;
  await db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, role: UserRole.INVESTOR },
      data: { investorAckTextVersion: version, investorAckAcceptedAt: now },
    });
    if (updated.count !== 1) throw new AccountError("forbidden");
    await writeAudit(
      {
        actorId: userId,
        action: AUTH_AUDIT.INVESTOR_ACK,
        entityType: "User",
        entityId: userId,
        meta,
        metadata: { textVersion: version },
      },
      tx,
    );
  });
}

export interface AccountSummary {
  id: string;
  email: string;
  name: string;
  organisation: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  investorAckAcceptedAt: Date | null;
  countries: { id: string; name: string }[];
  createdAt: Date;
  canReset: boolean;
}

/** Every account, for the admin accounts page. Empty for anyone who may not manage accounts. */
export async function listAccounts(
  viewer: Viewer | null,
): Promise<AccountSummary[]> {
  if (!canManageAccounts(viewer)) return [];
  const users = await db.user.findMany({
    where: userWhere(viewer),
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      organisation: true,
      role: true,
      status: true,
      mustChangePassword: true,
      investorAckAcceptedAt: true,
      createdAt: true,
      memberships: {
        select: { country: { select: { id: true, name: true } } },
        orderBy: { country: { name: "asc" } },
      },
    },
  });
  return users.map(({ memberships, ...user }) => ({
    ...user,
    countries: memberships.map((m) => m.country),
    canReset: canResetPassword(viewer, user),
  }));
}

/** Countries an admin can link a new account to. */
export async function listCountryChoices(
  viewer: Viewer | null,
): Promise<{ id: string; name: string }[]> {
  if (!canManageAccounts(viewer)) return [];
  return db.country.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
