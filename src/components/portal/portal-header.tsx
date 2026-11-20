import Link from "next/link";
import { AccountHeader } from "@/components/auth/account-header";
import { SiteHeader } from "@/components/site-header";
// The pure policy files, not the "@/lib/authz" index (which is server-only), so the header stays renderable in tests.
import {
  canListOwnMeetingRequests,
  canViewRequestInbox,
} from "@/lib/authz/requests";
import type { Viewer } from "@/lib/authz/viewer";

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
  viewer,
}: {
  name: string;
  showWorkspace: boolean;
  /** Upload links and submissions (M0) and accounts (M2), for Summit and platform admins. */
  showAdmin?: boolean;
  /** M5: decides the meeting request links (investor's own requests, country request inbox) through src/lib/authz. */
  viewer?: Viewer | null;
}) {
  const showRequests = canListOwnMeetingRequests(viewer ?? null);
  const showInbox = canViewRequestInbox(viewer ?? null);
  return (
    <SiteHeader homeHref="/home">
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
      {showRequests ? (
        <Link href="/requests" className={linkClass}>
          My requests
        </Link>
      ) : null}
      {showInbox ? (
        <Link href="/inbox" className={linkClass}>
          Meeting requests
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
      <Link href="/guide" className={linkClass}>
        User guide
      </Link>
      <AccountHeader name={name} />
    </SiteHeader>
  );
}
