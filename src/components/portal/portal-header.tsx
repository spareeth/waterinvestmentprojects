import Link from "next/link";
import { AccountHeader } from "@/components/auth/account-header";
import { SiteHeader } from "@/components/site-header";

const linkClass =
  "rounded-md text-white/90 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none";

/**
 * Top bar for signed-in pages. Which links appear is decided by the page through src/lib/authz
 * (canUseWorkspace, canListSubmissions) and passed in; hiding a link is convenience only, every page checks again.
 */
export function PortalHeader({
  name,
  showWorkspace,
  showAdmin = false,
}: {
  name: string;
  showWorkspace: boolean;
  /** Upload links and submissions (M0) and accounts (M2), for Summit and platform admins. */
  showAdmin?: boolean;
}) {
  return (
    <SiteHeader>
      <Link href="/home" className={linkClass}>
        Home
      </Link>
      <Link href="/pipeline" className={linkClass}>
        Pipeline
      </Link>
      {showWorkspace ? (
        <Link href="/workspace" className={linkClass}>
          My projects
        </Link>
      ) : null}
      {showAdmin ? (
        <>
          <Link href="/admin/submissions" className={linkClass}>
            Submissions
          </Link>
          <Link href="/admin/upload-links" className={linkClass}>
            Upload links
          </Link>
          <Link href="/admin/accounts" className={linkClass}>
            Accounts
          </Link>
        </>
      ) : null}
      <AccountHeader name={name} />
    </SiteHeader>
  );
}
