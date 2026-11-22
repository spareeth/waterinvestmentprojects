import "server-only";
import {
  type OrganisationType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import { normaliseEmail } from "@/lib/auth/auth";
import {
  describeMatch,
  isPublicEmailDomain,
  parseEmailDomains,
  preApprovalMatch,
} from "@/lib/auth/pre-approval";
import { loadPreApprovedList } from "@/lib/auth/service";
import {
  canApproveUsers,
  canManagePreApproval,
} from "@/lib/authz/account-policies";
import type { Viewer } from "@/lib/authz/viewer";
import { db } from "@/lib/db";

// Admin console, registrations (M13, PLAN v0.4 0b.17 to 0b.21): the queue of investor registrations waiting
// for approval, and the pre-approved organisations (by email domain) and contacts (by email) from WBG. Every
// change is audited; permissions come from src/lib/authz/account-policies.ts.

export const PRE_APPROVAL_AUDIT = {
  ORGANISATION_CREATE: "approved_organisation.create",
  ORGANISATION_DELETE: "approved_organisation.delete",
  CONTACT_CREATE: "approved_contact.create",
  CONTACT_DELETE: "approved_contact.delete",
} as const;

export class PreApprovalError extends Error {
  constructor(
    public readonly code: "forbidden" | "invalid" | "not_found",
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(`Pre-approved list change refused: ${code}`);
    this.name = "PreApprovalError";
  }
}

export interface PendingRegistration {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  organisationType: OrganisationType | null;
  jobTitle: string | null;
  createdAt: Date;
  /** How the registrant matches the pre-approved list, in words. */
  preApproval: string;
  preApproved: boolean;
}

/** Investor registrations waiting for a decision, oldest first. Empty for anyone who may not approve. */
export async function listPendingRegistrations(
  viewer: Viewer | null,
): Promise<PendingRegistration[]> {
  if (!viewer || !canApproveUsers(viewer)) return [];
  const [users, list] = await Promise.all([
    db.user.findMany({
      where: { status: UserStatus.PENDING_APPROVAL, role: UserRole.INVESTOR },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        organisation: true,
        organisationType: true,
        jobTitle: true,
        createdAt: true,
      },
      take: 500,
    }),
    loadPreApprovedList(),
  ]);
  return users.map((u) => {
    const match = preApprovalMatch(u.email, list);
    return {
      ...u,
      preApproval: describeMatch(match),
      preApproved: match !== null,
    };
  });
}

/** The pre-approved list for the admin page. */
export async function listPreApproved(viewer: Viewer | null) {
  if (!viewer || !canManagePreApproval(viewer)) {
    throw new PreApprovalError("forbidden");
  }
  const [organisations, contacts] = await Promise.all([
    db.approvedOrganisation.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        emailDomains: true,
        source: true,
        _count: { select: { contacts: true } },
      },
    }),
    db.approvedContact.findMany({
      orderBy: { email: "asc" },
      select: {
        email: true,
        createdAt: true,
        organisation: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { organisations, contacts };
}

/** Adds a pre-approved organisation with its email domains (none is fine: then only its contacts match). */
export async function addApprovedOrganisation(
  viewer: Viewer,
  input: { name: string; domains: string; source: string },
  meta?: RequestMeta,
): Promise<string> {
  if (!canManagePreApproval(viewer)) throw new PreApprovalError("forbidden");
  const name = input.name.replace(/\s+/g, " ").trim();
  const fieldErrors: Record<string, string> = {};
  if (name.length < 2 || name.length > 160) {
    fieldErrors.name = "Enter the organisation's name (up to 160 characters).";
  }
  const domains = parseEmailDomains(input.domains);
  if (!domains.ok) fieldErrors.domains = domains.error;
  const source = input.source.replace(/\s+/g, " ").trim().slice(0, 120);
  if (Object.keys(fieldErrors).length > 0 || !domains.ok) {
    throw new PreApprovalError("invalid", fieldErrors);
  }
  return db.$transaction(async (tx) => {
    const created = await tx.approvedOrganisation.create({
      data: { name, emailDomains: domains.domains, source },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: PRE_APPROVAL_AUDIT.ORGANISATION_CREATE,
        entityType: "ApprovedOrganisation",
        entityId: created.id,
        meta,
        metadata: { name, emailDomains: domains.domains, source },
      },
      tx,
    );
    return created.id;
  });
}

export async function removeApprovedOrganisation(
  viewer: Viewer,
  id: string,
  meta?: RequestMeta,
): Promise<void> {
  if (!canManagePreApproval(viewer)) throw new PreApprovalError("forbidden");
  await db.$transaction(async (tx) => {
    const found = await tx.approvedOrganisation.findUnique({
      where: { id },
      select: { name: true, emailDomains: true },
    });
    if (!found) throw new PreApprovalError("not_found");
    // Its contacts stay pre-approved by email (organisationId is set to null).
    await tx.approvedOrganisation.delete({ where: { id } });
    await writeAudit(
      {
        actorId: viewer.id,
        action: PRE_APPROVAL_AUDIT.ORGANISATION_DELETE,
        entityType: "ApprovedOrganisation",
        entityId: id,
        meta,
        metadata: found,
      },
      tx,
    );
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds pre-approved contacts, several at once (one email per line, or separated by commas or spaces), optionally
 * linked to a pre-approved organisation. Addresses already on the list are left as they are. Public email
 * addresses are allowed here: the exact address is approved, never the domain.
 */
export async function addApprovedContacts(
  viewer: Viewer,
  input: { emails: string; organisationId: string | null },
  meta?: RequestMeta,
): Promise<{ added: number; existing: number }> {
  if (!canManagePreApproval(viewer)) throw new PreApprovalError("forbidden");
  const emails = [
    ...new Set(
      input.emails
        .split(/[\s,;]+/)
        .map((e) => normaliseEmail(e))
        .filter(Boolean),
    ),
  ];
  const bad = emails.find((e) => !EMAIL.test(e) || e.length > 254);
  if (emails.length === 0 || bad || emails.length > 500) {
    throw new PreApprovalError("invalid", {
      emails: bad
        ? `"${bad.slice(0, 60)}" is not an email address.`
        : "Enter one to 500 email addresses.",
    });
  }
  return db.$transaction(async (tx) => {
    if (input.organisationId) {
      const org = await tx.approvedOrganisation.findUnique({
        where: { id: input.organisationId },
        select: { id: true },
      });
      if (!org) {
        throw new PreApprovalError("invalid", {
          organisationId: "That organisation is no longer on the list.",
        });
      }
    }
    const existing = await tx.approvedContact.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const known = new Set(existing.map((e) => e.email));
    const fresh = emails.filter((e) => !known.has(e));
    for (const email of fresh) {
      await tx.approvedContact.create({
        data: { email, organisationId: input.organisationId },
      });
      await writeAudit(
        {
          actorId: viewer.id,
          action: PRE_APPROVAL_AUDIT.CONTACT_CREATE,
          entityType: "ApprovedContact",
          entityId: email,
          meta,
          metadata: {
            organisationId: input.organisationId,
            publicDomain: isPublicEmailDomain(email.split("@")[1] ?? ""),
          },
        },
        tx,
      );
    }
    return { added: fresh.length, existing: known.size };
  });
}

export async function removeApprovedContact(
  viewer: Viewer,
  email: string,
  meta?: RequestMeta,
): Promise<void> {
  if (!canManagePreApproval(viewer)) throw new PreApprovalError("forbidden");
  const address = normaliseEmail(email);
  await db.$transaction(async (tx) => {
    const removed = await tx.approvedContact.deleteMany({
      where: { email: address },
    });
    if (removed.count !== 1) throw new PreApprovalError("not_found");
    await writeAudit(
      {
        actorId: viewer.id,
        action: PRE_APPROVAL_AUDIT.CONTACT_DELETE,
        entityType: "ApprovedContact",
        entityId: address,
        meta,
      },
      tx,
    );
  });
}
