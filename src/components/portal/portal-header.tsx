import Link from "next/link";
import { AccountHeader } from "@/components/auth/account-header";
import { SiteHeader } from "@/components/site-header";
// The pure policy files, not the "@/lib/authz" index (which is server-only), so the header stays renderable in tests.
import {
  canListOwnMeetingRequests,
  canViewRequestInbox,
} from "@/lib/authz/requests";
import { canManageMeetingSchedule } from "@/lib/authz/slots";
import { canListSubmissions } from "@/lib/authz/submissions";
import type { Viewer } from "@/lib/authz/viewer";
import { canUseWorkspace } from "@/lib/authz/workspace";

const linkClass =
  "rounded-md text-white/90 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none";

/**
 * Top bar for signed-in pages. The links are decided here from the viewer through src/lib/authz, so every page
 * shows the same tabs for the same person (22 Nov: My projects and the admin pages used to drop some). Hiding a
 * link is convenience only, every page checks again.
 */
export function PortalHeader({
  name,
  viewer,
}: {
  name: string;
  viewer: Viewer | null;
}) {
  const showWorkspace = canUseWorkspace(viewer);
  /** Upload links and submissions (M0) and accounts (M2), for Summit and platform admins. */
  const showAdmin = canListSubmissions(viewer);
  const showRequests = canListOwnMeetingRequests(viewer);
  const showInbox = canViewRequestInbox(viewer);
  const showCalendar = canManageMeetingSchedule(viewer);
  return (
    <SiteHeader menuFrom={showAdmin ? "wide" : "xl"}>
      <Link href="/home" className={linkClass}>
        Home
      </Link>
      <Link href="/pipeline" className={linkClass}>
        Pipeline projects
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
      {showCalendar ? (
        // 23 Nov: the Summit team's requests and room calendar are one section.
        <Link href="/admin/meetings" className={linkClass}>
          Meeting calendar
        </Link>
      ) : showInbox ? (
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
