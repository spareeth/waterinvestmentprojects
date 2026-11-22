import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePortalUser } from "@/lib/authz";
import { canUseAdminConsole } from "@/lib/authz/admin";
import { getAdminOverview } from "@/lib/admin/projects";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Admin" };

function Card({
  href,
  title,
  lines,
  action,
}: {
  href: string;
  title: string;
  lines: string[];
  action: string;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Link
        href={href}
        className="self-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {action}
      </Link>
    </li>
  );
}

/** Admin console hub (M7, PLAN v0.3 F7): counts and a way into every admin page. */
export default async function AdminPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canUseAdminConsole(viewer)) notFound();
  const o = await getAdminOverview(viewer);

  return (
    <AdminShell
      name={user.name}
      viewer={viewer}
      current="/admin"
      title="Admin"
      intro="Everything the Summit team manages: projects and their filters, countries and contacts, accounts, and exports. Every change is recorded in the audit log."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          href="/admin/projects"
          title="Projects"
          lines={[
            `${o.projects.PUBLISHED} in the pipeline, ${o.projects.DRAFT} drafts, ${o.projects.WITHDRAWN} withdrawn`,
            `${o.missing} without PPP model, size or development stage`,
          ]}
          action="Review and publish"
        />
        <Card
          href="/admin/projects/import"
          title="Import project filters"
          lines={[
            "PPP model, size and development stage from a CSV, checked before anything is saved.",
          ]}
          action="Import a CSV"
        />
        <Card
          href="/admin/countries"
          title="Countries and contacts"
          lines={[
            `${o.countries.active} active, ${o.countries.inactive} switched off`,
            `${o.contacts} contacts; ${o.countries.withoutFocalPoint} active ${o.countries.withoutFocalPoint === 1 ? "country has" : "countries have"} no focal point`,
          ]}
          action="Manage countries"
        />
        <Card
          href="/admin/accounts"
          title="Accounts"
          lines={[
            `${o.accounts.total} accounts`,
            `${o.accounts.awaitingFirstSignIn} still on a temporary password, ${o.accounts.deactivated} switched off`,
          ]}
          action="Manage accounts"
        />
        <Card
          href="/admin/accounts/bulk"
          title="Many accounts at once"
          lines={[
            "Create accounts from a CSV and hand out the temporary passwords.",
          ]}
          action="Create from a CSV"
        />
        <Card
          href="/admin/exports"
          title="Exports"
          lines={[
            "Projects, submissions, contacts and accounts as CSV, and everything for one country as a ZIP.",
          ]}
          action="Download exports"
        />
      </ul>
    </AdminShell>
  );
}
