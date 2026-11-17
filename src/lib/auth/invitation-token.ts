import { createHash, randomBytes } from "node:crypto";

// Pure invitation helpers (no database), shared by the invitation service and unit tests.

export type InvitationState =
  "valid" | "not_found" | "accepted" | "expired" | "account_exists";

/** 32 random bytes, URL-safe. Sent once by email; only its hash is stored. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Checks a stored invitation against the clock. Accepted wins over expired: a used link stays "used". */
export function invitationState(
  invitation: { acceptedAt: Date | null; expiresAt: Date } | null,
  now: Date,
): InvitationState {
  if (!invitation) return "not_found";
  if (invitation.acceptedAt) return "accepted";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
