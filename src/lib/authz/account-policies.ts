// Who may invite and approve accounts (PLAN section 3). Pure functions; M4 adds the data permissions.

import {
  MembershipRole,
  PipelineScope,
  UserRole,
} from "@/generated/prisma/enums";

export interface Actor {
  id: string;
  role: UserRole;
  /** Country memberships of a COUNTRY user. */
  memberships: { countryId: string; role: MembershipRole }[];
}

export interface InvitationRequest {
  role: UserRole;
  countryId: string | null;
  membershipRole: MembershipRole | null;
  /** Pipeline visibility for the new user; empty means the default for the role. */
  pipelineScope?: PipelineScope | null;
}

/**
 * Pipeline visibility when nobody chooses otherwise: every invited investor sees the whole pipeline (PLAN v0.2),
 * everyone else sees no other country's projects.
 */
export function defaultPipelineScope(role: UserRole): PipelineScope {
  return role === UserRole.INVESTOR ? PipelineScope.ALL : PipelineScope.NONE;
}

const ADMIN_ROLES: readonly UserRole[] = [
  UserRole.PLATFORM_ADMIN,
  UserRole.SUMMIT_ADMIN,
];

export function isAdmin(actor: Pick<Actor, "role">): boolean {
  return ADMIN_ROLES.includes(actor.role);
}

/** Shape rules that hold whoever invites: COUNTRY invitations name a country and a membership role, others neither. */
export function invitationShapeError(
  request: InvitationRequest,
): string | null {
  if (request.role === UserRole.COUNTRY) {
    if (!request.countryId || !request.membershipRole) {
      return "A country invitation needs a country and a membership role.";
    }
    return null;
  }
  if (request.countryId || request.membershipRole) {
    return "Only country invitations can name a country or membership role.";
  }
  return null;
}

/**
 * Platform admins may invite anyone. Summit admins may invite anyone except platform admins.
 * Country focal points may invite MEMBERs to their own country only, with the default pipeline visibility (only
 * admins widen what someone sees). Everyone else may not invite.
 */
export function canInvite(actor: Actor, request: InvitationRequest): boolean {
  if (invitationShapeError(request)) return false;
  if (actor.role === UserRole.PLATFORM_ADMIN) return true;
  if (actor.role === UserRole.SUMMIT_ADMIN) {
    return request.role !== UserRole.PLATFORM_ADMIN;
  }
  if (actor.role === UserRole.COUNTRY) {
    const scope = request.pipelineScope ?? defaultPipelineScope(request.role);
    return (
      request.role === UserRole.COUNTRY &&
      scope === defaultPipelineScope(request.role) &&
      request.membershipRole === MembershipRole.MEMBER &&
      actor.memberships.some(
        (m) =>
          m.countryId === request.countryId &&
          m.role === MembershipRole.FOCAL_POINT,
      )
    );
  }
  return false;
}

/** Self-registered accounts are approved by the Summit team (or Terra). */
export function canApproveUsers(actor: Pick<Actor, "role">): boolean {
  return isAdmin(actor);
}

/** Who may change a user's pipeline visibility (scope and selected countries) after the account exists. */
export function canSetPipelineScope(actor: Pick<Actor, "role">): boolean {
  return isAdmin(actor);
}
