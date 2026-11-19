import Link from "next/link";
import type { ReactNode } from "react";
import { PortalHeader } from "@/components/portal/portal-header";
import { cn } from "@/lib/utils";

// Frame for every admin console page (M7): the portal header, a row of admin sections and the page body.
// Pages decide access themselves (canUseAdminConsole in src/lib/authz/admin.ts) before rendering this.

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/countries", label: "Countries and contacts" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/upload-links", label: "Upload links" },
  { href: "/inbox", label: "Meeting requests" },
  { href: "/admin/exports", label: "Exports" },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["href"];

export function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav aria-label="Admin sections" className="border-b bg-card print:hidden">
      <ul className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-1 gap-y-1 px-4 py-2 sm:px-8">
        {ADMIN_SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={s.href === current ? "page" : undefined}
              className={cn(
                "inline-block rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                s.href === current && "bg-muted text-foreground",
              )}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AdminShell({
  name,
  showWorkspace,
  current,
  title,
  intro,
  children,
}: {
  name: string;
  showWorkspace: boolean;
  current: AdminSection;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PortalHeader name={name} showWorkspace={showWorkspace} showAdmin />
      <AdminNav current={current} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            {title}
          </h1>
          {intro ? (
            <div className="mt-1 max-w-3xl text-muted-foreground">{intro}</div>
          ) : null}
        </div>
        {children}
      </main>
    </>
  );
}

/** A titled card section used across the admin pages. */
export function AdminSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <div className="mt-1 text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
