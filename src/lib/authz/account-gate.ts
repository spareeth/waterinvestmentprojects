// Account gate: which part of the portal a signed-in person may use right now.
// Pure functions (no database, no request), so the rules can be unit tested directly.
// First piece of the single policy module (src/lib/authz); M4 adds the data permissions.

import { UserRole, UserStatus } from "@/generated/prisma/enums";

export interface GateUser {
  role: UserRole;
  status: UserStatus;
  mfaEnabled: boolean;
  /** M2: an admin handed out a temporary password that the person has not replaced yet. */
  mustChangePassword: boolean;
  termsAcceptedAt: Date | null;
  /** M2: version of the investor acknowledgement the person accepted, if any. */
  investorAckTextVersion: string | null;
}

export interface GateSession {
  /** When the person signed in. */
  createdAt: Date;
  /** Last request seen on this session. */
  lastSeenAt: Date;
}

export interface GateConfig {
  idleMinutes: number;
  maxHours: number;
  /**
   * AUTH_SECOND_STEP. "none" (PLAN 0a.3, the default) asks nobody to set up a second step; "totp" requires an
   * authenticator app before anything else.
   */
  secondStep: "none" | "totp";
  /** Current version of the investor acknowledgement (config). Investors accept it again when it changes. */
  investorAckVersion: string;
}

/** Why an existing session can no longer be used. */
export type SessionProblem = "deactivated" | "idle" | "expired";

/**
 * Where a signed-in person must go, in order: pending approval (sees nothing else), a new password in place of
 * the temporary one, two-step enrolment (only with AUTH_SECOND_STEP=totp), then the investor acknowledgement
 * (investors) or the terms of use (everyone else), then the portal.
 */
export type AccountStage =
  | "pending"
  | "change-password"
  | "enrol-2fa"
  | "investor-ack"
  | "terms"
  | "active";

export const STAGE_PATH: Record<AccountStage, string> = {
  pending: "/pending",
  "change-password": "/change-password",
  "enrol-2fa": "/two-factor/setup",
  "investor-ack": "/acknowledgement",
  terms: "/terms",
  active: "/home",
};

export function sessionProblem(
  user: Pick<GateUser, "status">,
  session: GateSession,
  now: Date,
  config: Pick<GateConfig, "idleMinutes" | "maxHours">,
): SessionProblem | null {
  if (user.status === UserStatus.DEACTIVATED) return "deactivated";
  const ageMs = now.getTime() - session.createdAt.getTime();
  if (ageMs > config.maxHours * 60 * 60_000) return "expired";
  const idleMs = now.getTime() - session.lastSeenAt.getTime();
  if (idleMs > config.idleMinutes * 60_000) return "idle";
  return null;
}

/**
 * Whether a handed-out temporary password must be replaced at the first sign-in. M12 (PLAN v0.4 0b.11): not for
 * COUNTRY and WBG_COORDINATOR accounts, which WBG relationship managers may co-manage with the government (a
 * change by one would lock out the other). Investors and admins still choose their own. The compensating
 * controls are long generated passwords (about 79 bits), sign-in rate limiting, the audit log, admin reset, and
 * switching the accounts off after the Summit.
 */
export function mustChooseOwnPassword(role: UserRole): boolean {
  return role !== UserRole.COUNTRY && role !== UserRole.WBG_COORDINATOR;
}

/** Investors accept the investor acknowledgement (CLAUDE.md: no pipeline before it); nobody else is asked. */
export function needsInvestorAck(
  user: Pick<GateUser, "role" | "investorAckTextVersion">,
  config: Pick<GateConfig, "investorAckVersion">,
): boolean {
  return (
    user.role === UserRole.INVESTOR &&
    user.investorAckTextVersion !== config.investorAckVersion
  );
}

export function accountStage(
  user: GateUser,
  config: Pick<GateConfig, "secondStep" | "investorAckVersion">,
): AccountStage {
  if (user.status !== UserStatus.ACTIVE) return "pending";
  if (user.mustChangePassword && mustChooseOwnPassword(user.role)) {
    return "change-password";
  }
  if (config.secondStep === "totp" && !user.mfaEnabled) return "enrol-2fa";
  if (user.role === UserRole.INVESTOR) {
    return needsInvestorAck(user, config) ? "investor-ack" : "active";
  }
  if (!user.termsAcceptedAt) return "terms";
  return "active";
}
