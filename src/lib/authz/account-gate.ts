// Account gate: which part of the portal a signed-in person may use right now.
// Pure functions (no database, no request), so the rules can be unit tested directly.
// First piece of the single policy module (src/lib/authz); M4 adds the data permissions.

import { UserStatus } from "@/generated/prisma/enums";

export interface GateUser {
  status: UserStatus;
  mfaEnabled: boolean;
  termsAcceptedAt: Date | null;
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
  /** Staging and local demos only (AUTH_SKIP_SECOND_STEP); refused in production by the env schema. */
  skipSecondStep: boolean;
}

/** Why an existing session can no longer be used. */
export type SessionProblem = "deactivated" | "idle" | "expired";

/**
 * Where a signed-in person must go, in order:
 * pending approval (sees nothing else), two-step enrolment, terms of use, then the portal.
 */
export type AccountStage = "pending" | "enrol-2fa" | "terms" | "active";

export const STAGE_PATH: Record<AccountStage, string> = {
  pending: "/pending",
  "enrol-2fa": "/two-factor/setup",
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

export function accountStage(
  user: GateUser,
  config: Pick<GateConfig, "skipSecondStep">,
): AccountStage {
  if (user.status !== UserStatus.ACTIVE) return "pending";
  if (!user.mfaEnabled && !config.skipSecondStep) return "enrol-2fa";
  if (!user.termsAcceptedAt) return "terms";
  return "active";
}
