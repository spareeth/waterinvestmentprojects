// Who may invite and approve accounts (PLAN section 3). Pure functions; M4 adds the data permissions.

import { MembershipRole, UserRole } from "@/generated/prisma/enums";

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
 * Country focal points may invite MEMBERs to their own country only. Everyone else may not invite.
 * (The invitation flow is dormant since M2: admins hand out accounts.)
 */
export function canInvite(actor: Actor, request: InvitationRequest): boolean {
  if (invitationShapeError(request)) return false;
  if (actor.role === UserRole.PLATFORM_ADMIN) return true;
  if (actor.role === UserRole.SUMMIT_ADMIN) {
    return request.role !== UserRole.PLATFORM_ADMIN;
  }
  if (actor.role === UserRole.COUNTRY) {
    return (
      request.role === UserRole.COUNTRY &&
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

// ---------------------------------------------------------------------------
// M2 (PLAN 0a.4): accounts handed out by admins with a temporary password
// ---------------------------------------------------------------------------

export interface AccountRequest {
  role: UserRole;
  /** Countries of a COUNTRY user (focal point) or a WBG coordinator; empty for every other role. */
  countryIds: string[];
}

/** Roles that work for one or more countries and so must name them. */
export const COUNTRY_LINKED_ROLES: readonly UserRole[] = [
  UserRole.COUNTRY,
  UserRole.WBG_COORDINATOR,
];

/** Shape rules whoever creates the account: country users and coordinators name countries, others none. */
export function accountShapeError(request: AccountRequest): string | null {
  const linked = COUNTRY_LINKED_ROLES.includes(request.role);
  if (linked && request.countryIds.length === 0) {
    return "Choose at least one country for this role.";
  }
  if (!linked && request.countryIds.length > 0) {
    return "Only country representatives and WBG coordinators are linked to countries.";
  }
  return null;
}

/** The account list and the "create account" page: Summit admins and platform admins. */
export function canManageAccounts(actor: Pick<Actor, "role"> | null): boolean {
  return actor !== null && isAdmin(actor);
}

/** Roles this admin may give to a new account. Only platform admins create platform admins. */
export function assignableRoles(actor: Pick<Actor, "role"> | null): UserRole[] {
  if (!canManageAccounts(actor)) return [];
  const all = [
    UserRole.INVESTOR,
    UserRole.COUNTRY,
    UserRole.WBG_COORDINATOR,
    UserRole.SUMMIT_ADMIN,
    UserRole.PLATFORM_ADMIN,
  ];
  return actor?.role === UserRole.PLATFORM_ADMIN
    ? all
    : all.filter((role) => role !== UserRole.PLATFORM_ADMIN);
}

export function canCreateAccount(
  actor: Pick<Actor, "role"> | null,
  request: AccountRequest,
): boolean {
  if (accountShapeError(request)) return false;
  return assignableRoles(actor).includes(request.role);
}

/**
 * A new temporary password for someone who forgot theirs (no email reset yet). Admins only, never for their own
 * account (they change it like everyone else), and Summit admins not for platform admins.
 */
export function canResetPassword(
  actor: Pick<Actor, "id" | "role"> | null,
  target: { id: string; role: UserRole },
): boolean {
  if (!actor || actor.id === target.id) return false;
  return assignableRoles(actor).includes(target.role);
}
