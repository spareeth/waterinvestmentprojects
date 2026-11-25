import "server-only";
import { createHash } from "node:crypto";
import type { UserRole } from "@/generated/prisma/enums";
import { UserStatus } from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import { AccountError, createAccount } from "@/lib/auth/accounts";
import type { Auth } from "@/lib/auth/auth";
import type { Viewer } from "@/lib/authz";
import { assignableRoles } from "@/lib/authz/account-policies";
import {
  canBulkCreateAccounts,
  canRemoveUser,
  canSetAccountStatus,
} from "@/lib/authz/admin";
import { db } from "@/lib/db";
import type { Mailer } from "@/lib/mail";
import {
  cancelOpenRequestsWhere,
  notifyCancelledRequests,
} from "@/lib/requests/service";
import {
  BULK_ACCOUNTS_MAX_ROWS,
  type BulkAccountPlan,
  planBulkAccounts,
} from "./bulk-accounts-input";
import { parseCsv } from "./csv-parse";
import { ADMIN_AUDIT, AdminError } from "./errors";

// Admin console, accounts (M7, PLAN v0.3 0a.4): many accounts at once from a CSV, and switching accounts off and on.
// Each account is created by M2's createAccount (src/lib/auth/accounts.ts), so the rules, the temporary password and
// the user.create audit event are exactly those of a single account. Temporary passwords go back to the admin once
// and are never stored, logged or written to the audit trail.

interface Options {
  meta?: RequestMeta;
  /** Tests pass their own Better Auth instance. */
  auth?: Auth;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface BulkAccountsPreview {
  plan: BulkAccountPlan;
  digest: string;
}

async function bulkPlanFor(
  viewer: Viewer,
  text: string,
): Promise<BulkAccountsPreview> {
  const parsed = parseCsv(text, { maxRows: BULK_ACCOUNTS_MAX_ROWS });
  if (!parsed.ok) {
    return {
      plan: {
        fileErrors: [parsed.error],
        rows: [],
        summary: { rows: 0, ready: 0, errors: 0 },
      },
      digest: sha256(`${sha256(text)}|error`),
    };
  }
  const emailIndex = parsed.table.header.indexOf("email");
  const emails = parsed.table.rows
    .map((r) => (r.cells[emailIndex] ?? "").trim().toLowerCase())
    .filter(Boolean);
  const [countries, existing] = await Promise.all([
    db.country.findMany({ select: { id: true, iso3: true } }),
    db.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
  ]);
  const plan = planBulkAccounts(parsed.table, {
    countries,
    assignableRoles: assignableRoles(viewer),
    existingEmails: new Set(existing.map((u) => u.email.toLowerCase())),
  });
  const ready = plan.rows
    .filter((r) => r.errors.length === 0)
    .map((r) => [
      r.email,
      r.name,
      r.organisation,
      r.jobTitle,
      r.role,
      r.countryIds,
    ]);
  return {
    plan,
    digest: sha256(
      `${sha256(text)}|${JSON.stringify([plan.fileErrors, ready])}`,
    ),
  };
}

export async function previewBulkAccounts(
  viewer: Viewer,
  text: string,
): Promise<BulkAccountsPreview> {
  if (!canBulkCreateAccounts(viewer)) throw new AdminError("forbidden");
  return bulkPlanFor(viewer, text);
}

export interface HandOut {
  line: number;
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
}

export interface BulkAccountsResult {
  created: HandOut[];
  /** Rows refused while creating (for example an account made in the meantime). */
  failed: { line: number; email: string; message: string }[];
}

/**
 * Creates every valid row of the previewed file. Each account is its own transaction (as when created one by one),
 * so one refusal does not undo the others. The result is the only place the temporary passwords appear.
 */
export async function applyBulkAccounts(
  viewer: Viewer,
  text: string,
  digest: string,
  { meta, auth }: Options = {},
): Promise<BulkAccountsResult> {
  if (!canBulkCreateAccounts(viewer)) throw new AdminError("forbidden");
  const { plan, digest: fresh } = await bulkPlanFor(viewer, text);
  if (plan.fileErrors.length > 0) throw new AdminError("invalid");
  if (fresh !== digest) throw new AdminError("stale");
  const result: BulkAccountsResult = { created: [], failed: [] };
  for (const row of plan.rows) {
    if (row.errors.length > 0 || !row.role) continue;
    try {
      const created = await createAccount(
        viewer,
        {
          email: row.email,
          name: row.name,
          organisation: row.organisation,
          jobTitle: row.jobTitle,
          role: row.role,
          countryIds: row.countryIds,
        },
        meta,
        { auth },
      );
      result.created.push({
        line: row.line,
        name: row.name,
        email: created.email,
        role: row.role,
        temporaryPassword: created.temporaryPassword,
      });
    } catch (error) {
      if (!(error instanceof AccountError)) throw error;
      result.failed.push({
        line: row.line,
        email: row.email,
        message:
          Object.values(error.fieldErrors)[0] ?? "The account was refused.",
      });
    }
  }
  // Summary only: who was created, never a password.
  const createdIds = await db.user.findMany({
    where: { email: { in: result.created.map((c) => c.email) } },
    select: { id: true },
  });
  await writeAudit({
    actorId: viewer.id,
    action: ADMIN_AUDIT.ACCOUNTS_BULK_CREATE,
    entityType: "User",
    entityId: null,
    meta,
    metadata: {
      fileSha256: sha256(text),
      rows: plan.summary.rows,
      created: result.created.length,
      failed: result.failed.length,
      skippedWithErrors: plan.summary.errors,
      userIds: createdIds.map((u) => u.id),
    },
  });
  return result;
}

/**
 * Switches an account off (DEACTIVATED: no sign-in, every session ended) or back on (ACTIVE). Nothing is deleted:
 * the person's requests and the audit trail stay.
 */
export async function setAccountStatus(
  viewer: Viewer,
  userId: string,
  status: typeof UserStatus.ACTIVE | typeof UserStatus.DEACTIVATED,
  { meta }: Options = {},
): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, email: true },
    });
    if (!target) throw new AdminError("not_found");
    if (!canSetAccountStatus(viewer, target)) {
      throw new AdminError("forbidden");
    }
    if (target.status === status) return;
    // Switching back on only undoes a switch-off; it never approves a pending self-registration.
    if (
      status === UserStatus.ACTIVE &&
      target.status !== UserStatus.DEACTIVATED
    ) {
      throw new AdminError("invalid");
    }
    await tx.user.update({ where: { id: userId }, data: { status } });
    let sessionsEnded = 0;
    if (status === UserStatus.DEACTIVATED) {
      sessionsEnded = (await tx.session.deleteMany({ where: { userId } }))
        .count;
    }
    await writeAudit(
      {
        actorId: viewer.id,
        action:
          status === UserStatus.DEACTIVATED
            ? ADMIN_AUDIT.USER_DEACTIVATE
            : ADMIN_AUDIT.USER_REACTIVATE,
        entityType: "User",
        entityId: userId,
        meta,
        metadata: {
          email: target.email,
          previousStatus: target.status,
          status,
          sessionsEnded,
        },
      },
      tx,
    );
  });
}

/** Told to the country when a removed investor's open requests are cancelled. */
export const USER_REMOVED_REASON =
  "The requester's account was removed from the portal.";

/** The erased address of a removed account: unique, never deliverable, and frees the real address. */
export function removedEmail(userId: string): string {
  return `removed-${userId}@removed.invalid`;
}

/**
 * Removes an account (23 Nov, Sajid: erase and disable). In one transaction: the person's open meeting requests
 * are cancelled (slots freed, each audited); their sessions, sign-in credentials, two-factor settings, country
 * memberships, country contact entries and pending invitations are deleted; the account keeps its row (so the
 * audit trail, past requests and uploads stay intact) but its name and email are erased, its status is
 * DEACTIVATED and removedAt is set. The real email address can then be used for a new account. A user.remove
 * AuditEvent records the change. Afterwards the countries and the Summit mailbox are told of cancelled requests
 * (not the removed person). Past requests keep the attendee details the investor typed: they are the country's
 * record of the request.
 */
export async function removeUser(
  viewer: Viewer,
  userId: string,
  {
    meta,
    now = new Date(),
    mailer,
    summitRecipients,
  }: Options & {
    now?: Date;
    mailer?: Mailer;
    summitRecipients?: string[];
  } = {},
): Promise<void> {
  const cancelled = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        email: true,
        removedAt: true,
      },
    });
    if (!target || target.removedAt) throw new AdminError("not_found");
    if (!canRemoveUser(viewer, target)) throw new AdminError("forbidden");

    const requests = await cancelOpenRequestsWhere(
      tx,
      { requesterId: userId },
      viewer.id,
      USER_REMOVED_REASON,
      { meta, now },
    );
    // 25 Nov: their meeting sign-ups are withdrawn too (they stay as a record for the countries).
    const signups = await tx.meetingSignup.updateMany({
      where: { requesterId: userId, status: "ACTIVE" },
      data: { status: "WITHDRAWN" },
    });
    const sessions = await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.twoFactor.deleteMany({ where: { userId } });
    const memberships = await tx.countryMembership.deleteMany({
      where: { userId },
    });
    const contacts = await tx.countryContact.deleteMany({
      where: { OR: [{ userId }, { email: target.email.toLowerCase() }] },
    });
    await tx.invitation.deleteMany({
      where: { email: target.email, acceptedAt: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Removed user",
        email: removedEmail(userId),
        organisation: null,
        organisationType: null,
        jobTitle: null,
        image: null,
        status: UserStatus.DEACTIVATED,
        mustChangePassword: false,
        emailVerified: false,
        mfaEnabled: false,
        removedAt: now,
      },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: ADMIN_AUDIT.USER_REMOVE,
        entityType: "User",
        entityId: userId,
        meta,
        metadata: {
          role: target.role,
          previousStatus: target.status,
          sessionsEnded: sessions.count,
          membershipsRemoved: memberships.count,
          contactsRemoved: contacts.count,
          openRequestsCancelled: requests.length,
          signupsWithdrawn: signups.count,
        },
      },
      tx,
    );
    return requests;
  });
  await notifyCancelledRequests(cancelled, USER_REMOVED_REASON, {
    meta,
    mailer,
    summitRecipients,
    notifyInvestor: false,
  });
}
