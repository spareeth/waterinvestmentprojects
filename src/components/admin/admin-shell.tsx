import Link from "next/link";
import type { ReactNode } from "react";
import { PortalHeader } from "@/components/portal/portal-header";
import type { Viewer } from "@/lib/authz/viewer";
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
  { href: "/admin/meetings", label: "Meeting calendar" },
  { href: "/admin/exports", label: "Exports" },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["href"];

export function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav aria-label="Admin sections" className="bg-water-800 print:hidden">
      <ul className="mx-auto flex w-full max-w-page flex-wrap gap-x-1 px-4 sm:px-8">
        {ADMIN_SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={s.href === current ? "page" : undefined}
              className={cn(
                "inline-block px-3 py-3 text-sm font-medium text-water-200 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none",
                s.href === current &&
                  "font-semibold text-white shadow-[inset_0_-3px_0_var(--color-water-300)]",
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
  viewer,
  current,
  title,
  intro,
  children,
}: {
  name: string;
  viewer: Viewer;
  current: AdminSection;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PortalHeader name={name} viewer={viewer} />
      <AdminNav current={current} />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
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
