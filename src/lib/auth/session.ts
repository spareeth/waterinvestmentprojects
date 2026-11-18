import "server-only";
import { headers as nextHeaders } from "next/headers";
import { connection } from "next/server";
import type {
  MembershipRole,
  PipelineScope,
  UserRole,
} from "@/generated/prisma/enums";
import { requestMetaFrom, writeAudit } from "@/lib/audit";
import {
  type AccountStage,
  accountStage,
  type GateConfig,
  sessionProblem,
  STAGE_PATH,
} from "@/lib/authz/account-gate";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/config";
import { getEnv } from "@/lib/env";
import { type Auth, getAuth } from "./auth";
import { AUTH_AUDIT } from "./constants";

/** Only touch Session.updatedAt (last activity) once a minute, not on every request. */
const TOUCH_INTERVAL_MS = 60_000;

/** The signed-in person, narrowed to what pages and policies need. Never includes secrets. */
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  organisation: string | null;
  role: UserRole;
  mfaEnabled: boolean;
  memberships: { countryId: string; role: MembershipRole }[];
  /** Which countries' published projects this user sees in the pipeline (M4). */
  pipelineScope: PipelineScope;
  /** Countries listed for pipelineScope SELECTED; empty otherwise. */
  pipelineCountryIds: string[];
}

export interface CurrentSession {
  user: CurrentUser;
  sessionId: string;
  stage: AccountStage;
}

export function gateConfig(): GateConfig {
  const env = getEnv();
  return {
    idleMinutes: env.SESSION_IDLE_MINUTES,
    maxHours: env.SESSION_MAX_HOURS,
    secondStep: env.AUTH_SECOND_STEP,
    investorAckVersion: appConfig.investorAcknowledgement.version,
  };
}

/** The user fields the account gate reads. */
export const GATE_USER_SELECT = {
  role: true,
  status: true,
  mfaEnabled: true,
  mustChangePassword: true,
  termsAcceptedAt: true,
  investorAckTextVersion: true,
} as const;

/**
 * Where to send someone who has just signed in (pending screen, new password, enrolment, acknowledgement or
 * terms, or the portal).
 */
export async function stagePathForUser(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: GATE_USER_SELECT,
  });
  if (!user) return "/sign-in";
  return STAGE_PATH[accountStage(user, gateConfig())];
}

/**
 * Reads and checks the session for this request. Returns null when there is no usable session; a session that
 * is idle, too old or belongs to a deactivated account is deleted on the spot.
 */
export async function getCurrentSession(
  requestHeaders?: Headers,
  options: { auth?: Auth; config?: GateConfig; now?: Date } = {},
): Promise<CurrentSession | null> {
  if (!requestHeaders) {
    // Always per request: never prerendered or cached (Cache Components).
    await connection();
  }
  const headers = requestHeaders ?? (await nextHeaders());
  const auth = options.auth ?? getAuth();
  const config = options.config ?? gateConfig();
  const now = options.now ?? new Date();

  const found = await auth.api.getSession({
    headers,
    query: { disableRefresh: true, disableCookieCache: true },
  });
  if (!found) return null;

  const session = await db.session.findUnique({
    where: { id: found.session.id },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  const user = await db.user.findUnique({
    where: { id: found.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      organisation: true,
      ...GATE_USER_SELECT,
      memberships: { select: { countryId: true, role: true } },
      pipelineScope: true,
      pipelineCountries: { select: { countryId: true } },
    },
  });
  if (!session || !user) return null;

  const problem = sessionProblem(
    user,
    { createdAt: session.createdAt, lastSeenAt: session.updatedAt },
    now,
    config,
  );
  if (problem) {
    if (problem === "deactivated") {
      // Removed from the portal: end every session the person still has.
      await db.session.deleteMany({ where: { userId: user.id } });
    } else {
      await db.session.deleteMany({ where: { id: session.id } });
    }
    await writeAudit({
      actorId: user.id,
      action: AUTH_AUDIT.SESSION_EXPIRED,
      entityType: "User",
      entityId: user.id,
      meta: requestMetaFrom(headers),
      metadata: { reason: problem },
    });
    return null;
  }

  if (now.getTime() - session.updatedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { updatedAt: now },
    });
  }

  return {
    sessionId: session.id,
    stage: accountStage(user, config),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organisation: user.organisation,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      memberships: user.memberships,
      pipelineScope: user.pipelineScope,
      pipelineCountryIds: user.pipelineCountries.map((p) => p.countryId),
    },
  };
}
