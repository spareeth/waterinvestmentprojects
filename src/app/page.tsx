import { LandingPage } from "@/components/landing/landing-page";

/**
 * Public landing page (PLAN v0.3 F1, M6). Pre-rendered at build time, like the other public pages: config read
 * from the environment (APP_NAME, SUPPORT_EMAIL) is taken from the .env present at build, so rebuild after
 * changing it.
 */
export default function Home() {
  return <LandingPage />;
}
