import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentSession, stagePathForUser } from "@/lib/auth/session";

// Reads the session on the server and may redirect, so it renders per request.
export const instant = false;

/**
 * Public landing page (PLAN v0.3 F1, M6). Config read from the environment (APP_NAME, SUPPORT_EMAIL) is taken
 * from the .env present at build, so rebuild after changing it. Rendered per request so that someone who is
 * signed in is offered the way back into the portal instead of "Sign in" (the session is only read, never ended).
 */
export default async function Home() {
  const session = await getCurrentSession();
  const portalHref = session ? await stagePathForUser(session.user.id) : null;
  return <LandingPage portalHref={portalHref} />;
}
