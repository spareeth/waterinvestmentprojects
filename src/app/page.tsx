import { LandingPage } from "@/components/landing/landing-page";
import { PortalHeader } from "@/components/portal/portal-header";
import { getCurrentSession } from "@/lib/auth/session";
import { viewerFrom } from "@/lib/authz/viewer";
import { getEnv } from "@/lib/env";

// Reads the session on the server and may redirect, so it renders per request.
export const instant = false;

/**
 * Public landing page (PLAN v0.3 F1, M6). Config read from the environment (APP_NAME, SUPPORT_EMAIL) is taken
 * from the .env present at build, so rebuild after changing it. Rendered per request: the landing page is part of
 * the portal, so someone signed in sees the same top bar as on every signed-in page (the session is only read).
 */
export default async function Home() {
  const session = await getCurrentSession();
  const viewer = viewerFrom(session);
  const portalHeader =
    session && viewer ? (
      <PortalHeader name={session.user.name} viewer={viewer} />
    ) : null;
  return (
    <LandingPage
      portalHeader={portalHeader}
      registrationOpen={getEnv().SELF_REGISTRATION_ENABLED}
    />
  );
}
