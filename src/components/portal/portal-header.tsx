import Link from "next/link";
import { AccountHeader } from "@/components/auth/account-header";
import { SiteHeader } from "@/components/site-header";

const linkClass =
  "rounded-md text-white/90 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none";

/**
 * Top bar for signed-in pages. Which links appear is decided by the page through src/lib/authz
 * (canUseWorkspace) and passed in; hiding a link is convenience only, every page checks again.
 */
export function PortalHeader({
  name,
  showWorkspace,
}: {
  name: string;
  showWorkspace: boolean;
}) {
  return (
    <SiteHeader>
      <Link href="/home" className={linkClass}>
        Home
      </Link>
      {showWorkspace ? (
        <Link href="/workspace" className={linkClass}>
          My projects
        </Link>
      ) : null}
      <AccountHeader name={name} />
    </SiteHeader>
  );
}
