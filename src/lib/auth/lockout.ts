import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  AUTH_AUDIT,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_WINDOW_MINUTES,
} from "./constants";

/** Reasons that count towards a lockout. Attempts refused because of the lockout itself do not extend it. */
export const COUNTED_FAILURE_REASONS = [
  "invalid_password",
  "deactivated",
] as const;

/**
 * True when the email has had LOCKOUT_MAX_FAILURES counted failures within the last LOCKOUT_WINDOW_MINUTES.
 * Counted from the audit trail, so no extra table is needed and every lockout is explainable from the log.
 */
export async function isLockedOut(
  email: string,
  prisma: Pick<PrismaClient, "auditEvent"> = db,
  now: Date = new Date(),
): Promise<boolean> {
  if (!email) return false;
  const since = new Date(now.getTime() - LOCKOUT_WINDOW_MINUTES * 60_000);
  const failures = await prisma.auditEvent.count({
    where: {
      action: AUTH_AUDIT.LOGIN_FAILED,
      at: { gt: since },
      AND: [
        { metadata: { path: ["email"], equals: email } },
        {
          OR: COUNTED_FAILURE_REASONS.map((reason) => ({
            metadata: { path: ["reason"], equals: reason },
          })),
        },
      ],
    },
  });
  return failures >= LOCKOUT_MAX_FAILURES;
}
