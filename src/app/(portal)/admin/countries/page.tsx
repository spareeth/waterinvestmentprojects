import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSectionCard, AdminShell } from "@/components/admin/admin-shell";
import { ContactsImportForm } from "@/components/admin/contacts-import-form";
import {
  CountryStatusButton,
  CreateCountryForm,
} from "@/components/admin/country-forms";
import { Tag } from "@/components/workspace/status-badge";
import { CountryContactRole, CountryStatus } from "@/generated/prisma/enums";
import { canUseWorkspace, requirePortalUser } from "@/lib/authz";
import { canManageCountries } from "@/lib/authz/admin";
import { listAdminCountries } from "@/lib/admin/countries";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Countries and contacts" };

/** Countries, their focal points and WBG coordinators (M7, PLAN v0.3 0.10). */
export default async function AdminCountriesPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canManageCountries(viewer)) notFound();
  const countries = await listAdminCountries(viewer);

  return (
    <AdminShell
      name={user.name}
      showWorkspace={canUseWorkspace(viewer)}
      current="/admin/countries"
      title="Countries and contacts"
      intro="Focal points receive their country's meeting requests; coordinators are copied. A contact gives no access by itself: give the person an account as well (it is linked by the same email address)."
    >
      <section
        className="flex flex-col gap-3"
        aria-labelledby="countries-heading"
      >
        <h2 id="countries-heading" className="text-lg font-semibold">
          Countries ({countries.length})
        </h2>
        <ul className="flex flex-col gap-3">
          {countries.map((c) => {
            const focal = c.contacts.filter(
              (x) => x.role === CountryContactRole.FOCAL_POINT,
            );
            const coordinators = c.contacts.filter(
              (x) => x.role === CountryContactRole.WBG_COORDINATOR,
            );
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/countries/${c.id}`}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <Tag>{c.iso3}</Tag>
                    {c.status === CountryStatus.INACTIVE ? (
                      <Tag>Switched off</Tag>
                    ) : null}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {c._count.projects} project
                    {c._count.projects === 1 ? "" : "s"}, {c._count.memberships}{" "}
                    account{c._count.memberships === 1 ? "" : "s"}
                  </span>
                  <span className="text-sm break-words">
                    Focal points:{" "}
                    {focal.length > 0 ? (
                      focal.map((x) => x.name).join(", ")
                    ) : (
                      <span className="font-semibold text-pending-foreground">
                        none yet
                      </span>
                    )}
                  </span>
                  <span className="text-sm break-words">
                    Coordinators:{" "}
                    {coordinators.length > 0
                      ? coordinators.map((x) => x.name).join(", ")
                      : "none yet"}
                  </span>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Link
                    href={`/admin/countries/${c.id}`}
                    className="inline-flex h-7 items-center rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                  >
                    Contacts
                  </Link>
                  <CountryStatusButton
                    countryId={c.id}
                    name={c.name}
                    active={c.status === CountryStatus.ACTIVE}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <AdminSectionCard
        title="Add contacts from a CSV"
        description={
          <>
            For the focal point list and coordinator mapping. Columns: iso3,
            name, email, role (focal point or coordinator). Contacts already
            stored are left as they are. The{" "}
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="/admin/exports/contacts.csv"
            >
              contacts export
            </a>{" "}
            has the same first four columns.
          </>
        }
      >
        <ContactsImportForm />
      </AdminSectionCard>

      <AdminSectionCard
        title="Add a country"
        description="New countries start switched on. Use clearly fictional names outside production."
      >
        <CreateCountryForm />
      </AdminSectionCard>
    </AdminShell>
  );
}
