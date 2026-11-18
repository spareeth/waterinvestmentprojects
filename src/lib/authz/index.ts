import "server-only";
import { redirect } from "next/navigation";
import { type CurrentSession, getCurrentSession } from "@/lib/auth/session";
import { type AccountStage, STAGE_PATH } from "./account-gate";
import { type Viewer, viewerFrom } from "./viewer";

// Single policy module (CLAUDE.md). Every page, server action, route handler and file URL starts here.
// - Account gate (M3): requireSession / requireStage / requireActiveUser.
// - Data permissions (M4): requireViewer() gives the Viewer; scope every query with the where builders
//   (projectWhere, documentWhere, meetingRequestWhere, ...) and check actions with the can-functions.
//   Files only through authorizeDocumentFile(). Default deny: a null Viewer matches nothing.

export { type AccountStage, STAGE_PATH } from "./account-gate";
export type { CurrentSession, CurrentUser } from "@/lib/auth/session";
export * from "./viewer";
export * from "./projects";
export * from "./documents";
export * from "./grants";
export * from "./requests";
export * from "./slots";
export * from "./people";
export * from "./workspace";
export * from "./submissions";
export * from "./upload-token";
export * from "./upload-links";
export * from "./audit";
export * from "./data";

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

/** An approved account with two-step verification and accepted terms. */
export async function requireActiveUser(): Promise<CurrentSession> {
  return requireStage("active");
}

/** The Viewer for pages and server actions; redirects anyone without an active account. */
export async function requireViewer(): Promise<Viewer> {
  return (await requirePortalUser()).viewer;
}

/** The Viewer plus the signed-in user's display details (name for the header), from one session read. */
export async function requirePortalUser(): Promise<{
  user: CurrentSession["user"];
  viewer: Viewer;
}> {
  const session = await requireActiveUser();
  const viewer = viewerFrom(session);
  if (!viewer) redirect(STAGE_PATH[session.stage]);
  return { user: session.user, viewer };
}

/** The Viewer or null, without redirecting: for route handlers that answer 404 instead (file routes). */
export async function getViewer(): Promise<Viewer | null> {
  return viewerFrom(await getCurrentSession());
}
