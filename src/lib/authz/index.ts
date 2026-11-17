import "server-only";
import { redirect } from "next/navigation";
import { type CurrentSession, getCurrentSession } from "@/lib/auth/session";
import { type AccountStage, STAGE_PATH } from "./account-gate";

// Single policy module (CLAUDE.md). M3 adds the account gate: every signed-in page and server action starts here.
// M4 adds data permissions (projects, documents, requests, grants) on top of requireActiveUser().

export { type AccountStage, STAGE_PATH } from "./account-gate";
export type { CurrentSession, CurrentUser } from "@/lib/auth/session";

/** Any usable session, whatever the account stage. Redirects to sign-in otherwise. */
export async function requireSession(): Promise<CurrentSession> {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  return current;
}

/**
 * A session at exactly this stage of the account gate. Someone at another stage is sent to the page for their
 * stage, so a pending account can only ever reach the pending screen.
 */
export async function requireStage(
  stage: AccountStage,
): Promise<CurrentSession> {
  const current = await requireSession();
  if (current.stage !== stage) redirect(STAGE_PATH[current.stage]);
  return current;
}

/** An approved account with two-step verification and accepted terms. The starting point for M4 permissions. */
export async function requireActiveUser(): Promise<CurrentSession> {
  return requireStage("active");
}
