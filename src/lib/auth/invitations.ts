import "server-only";
import type {
  MembershipRole,
  PipelineScope,
  UserRole as UserRoleType,
} from "@/generated/prisma/enums";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  type Actor,
  canInvite,
  defaultPipelineScope,
  invitationShapeError,
} from "@/lib/authz/account-policies";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { type Auth, getAuth, normaliseEmail } from "./auth";
import {
  AUTH_AUDIT,
  INVITATION_DEFAULT_DAYS,
  MIN_PASSWORD_LENGTH,
} from "./constants";
import {
  generateInvitationToken,
  hashInvitationToken,
  type InvitationState,
  invitationState,
} from "./invitation-token";

// Invitation-based sign-up (PLAN F2). The token goes out by email; only its SHA-256 is stored.

export {
  generateInvitationToken,
  hashInvitationToken,
  type InvitationState,
  invitationState,
} from "./invitation-token";

export class InvitationError extends Error {
  constructor(public readonly state: Exclude<InvitationState, "valid">) {
    super(`Invitation cannot be used: ${state}`);
  }
}

export interface CreateInvitationInput {
  email: string;
  role: UserRoleType;
  countryId?: string | null;
  membershipRole?: MembershipRole | null;
  /** Pipeline visibility; empty means the role default (investors ALL, others NONE). Only admins may widen it. */
  pipelineScope?: PipelineScope | null;
  expiresInDays?: number;
}

/**
 * Creates an invitation and returns the one-time link. Nothing is emailed yet: the email provider is still to be
 * decided (PLAN section 4), so the admin console (M8) will send or display the link.
 */
export async function createInvitation(
  actor: Actor,
  input: CreateInvitationInput,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  const request = {
    role: input.role,
    countryId: input.countryId ?? null,
    membershipRole: input.membershipRole ?? null,
    pipelineScope: input.pipelineScope ?? defaultPipelineScope(input.role),
  };
  const shapeError = invitationShapeError(request);
  if (shapeError) throw new Error(shapeError);
  if (!canInvite(actor, request)) {
    throw new Error("Not allowed to send this invitation.");
  }

  const token = generateInvitationToken();
  const days = input.expiresInDays ?? INVITATION_DEFAULT_DAYS;
  const invitation = await db.$transaction(async (tx) => {
    const created = await tx.invitation.create({
      data: {
        email: normaliseEmail(input.email),
        role: request.role,
        countryId: request.countryId,
        membershipRole: request.membershipRole,
        pipelineScope: request.pipelineScope,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + days * 24 * 60 * 60_000),
        invitedById: actor.id,
      },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: AUTH_AUDIT.INVITATION_CREATE,
        entityType: "Invitation",
        entityId: created.id,
        meta,
        metadata: {
          role: request.role,
          countryId: request.countryId,
          membershipRole: request.membershipRole,
          pipelineScope: request.pipelineScope,
        },
      },
      tx,
    );
    return created;
  });

  return {
    invitation,
    token,
    url: `${appConfig.url}/invitation/${encodeURIComponent(token)}`,
  };
}

/** What the accept page may show about an invitation. */
export interface InvitationSummary {
  state: InvitationState;
  email?: string;
  role?: UserRoleType;
  countryName?: string | null;
}

export async function describeInvitation(
  token: string,
  now: Date = new Date(),
): Promise<InvitationSummary> {
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      email: true,
      role: true,
      acceptedAt: true,
      expiresAt: true,
      country: { select: { name: true } },
    },
  });
  const state = invitationState(invitation, now);
  if (state !== "valid" || !invitation) return { state };
  const existing = await db.user.findUnique({
    where: { email: normaliseEmail(invitation.email) },
    select: { id: true },
  });
  if (existing) return { state: "account_exists" };
  return {
    state,
    email: invitation.email,
    role: invitation.role,
    countryName: invitation.country?.name ?? null,
  };
}

export interface AcceptInvitationInput {
  name: string;
  password: string;
  organisation?: string | null;
  jobTitle?: string | null;
}

/**
 * Accepts an invitation in one transaction: claims it (single use, even under concurrent clicks), creates the
 * ACTIVE user with a password, the country membership for country invitations, and the audit row.
 * The caller then signs the person in; two-step enrolment and terms follow through the account gate.
 */
export async function acceptInvitation(
  token: string,
  input: AcceptInvitationInput,
  meta?: RequestMeta,
  options: { auth?: Auth; now?: Date } = {},
): Promise<{ userId: string; email: string }> {
  const now = options.now ?? new Date();
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Password too short.");
  }
  const auth = options.auth ?? getAuth();
  const passwordHash = await (
    await auth.$context
  ).password.hash(input.password);
  const tokenHash = hashInvitationToken(token);

  return db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash },
    });
    const state = invitationState(invitation, now);
    if (!invitation) throw new InvitationError("not_found");
    if (state !== "valid") throw new InvitationError(state);

    // Claim first: only one concurrent request can move acceptedAt from empty to set.
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) throw new InvitationError("accepted");

    const email = normaliseEmail(invitation.email);
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) throw new InvitationError("account_exists");

    const user = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        organisation: input.organisation?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        role: invitation.role,
        status: UserStatus.ACTIVE,
        pipelineScope: invitation.pipelineScope,
        emailVerified: true,
      },
      select: { id: true, email: true },
    });
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
    if (invitation.role === UserRole.COUNTRY) {
      if (!invitation.countryId || !invitation.membershipRole) {
        throw new Error(
          "Country invitation without a country or membership role.",
        );
      }
      await tx.countryMembership.create({
        data: {
          userId: user.id,
          countryId: invitation.countryId,
          role: invitation.membershipRole,
        },
      });
    }
    await writeAudit(
      {
        actorId: user.id,
        action: AUTH_AUDIT.INVITATION_ACCEPT,
        entityType: "Invitation",
        entityId: invitation.id,
        meta,
        metadata: {
          role: invitation.role,
          countryId: invitation.countryId,
          membershipRole: invitation.membershipRole,
          invitedById: invitation.invitedById,
        },
      },
      tx,
    );
    return { userId: user.id, email: user.email };
  });
}
