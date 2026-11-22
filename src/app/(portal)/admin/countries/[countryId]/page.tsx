import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSectionCard, AdminShell } from "@/components/admin/admin-shell";
import {
  ContactForm,
  CountryStatusButton,
  RemoveContactButton,
} from "@/components/admin/country-forms";
import { Tag } from "@/components/workspace/status-badge";
import { CountryStatus, UserStatus } from "@/generated/prisma/enums";
import { CONTACT_ROLE_LABEL } from "@/lib/admin/contacts-input";
import { getAdminCountry } from "@/lib/admin/countries";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { requirePortalUser } from "@/lib/authz";
import { canManageCountries } from "@/lib/authz/admin";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Country contacts" };

/** One country: its contacts (add, edit, remove) and the accounts that work for it (M7). */
export default async function AdminCountryPage({
  params,
}: {
  params: Promise<{ countryId: string }>;
}) {
  const { user, viewer } = await requirePortalUser();
  if (!canManageCountries(viewer)) notFound();
  const { countryId } = await params;
  const country = await getAdminCountry(viewer, countryId.slice(0, 64));
  if (!country) notFound();
  const accountEmails = new Set(country.memberships.map((m) => m.user.email));

  return (
    <AdminShell
      name={user.name}
      viewer={viewer}
      current="/admin/countries"
      title={country.name}
      intro={
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{country.iso3}</Tag>
          {country.status === CountryStatus.INACTIVE ? (
            <Tag>Switched off</Tag>
          ) : null}
          <span>
            {country._count.projects} project
            {country._count.projects === 1 ? "" : "s"}.{" "}
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={`/admin/projects?country=${country.id}`}
            >
              See the projects
            </Link>
          </span>
        </div>
      }
    >
      <p>
        <Link
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          href="/admin/countries"
        >
          Back to all countries
        </Link>
      </p>

      <AdminSectionCard
        title={`Contacts (${country.contacts.length})`}
        description="Changing an email address links the contact to the matching account, if there is one."
      >
        {country.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {country.contacts.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <Tag>{CONTACT_ROLE_LABEL[c.role]}</Tag>
                  {c.user ? (
                    <Tag>
                      {c.user.status === UserStatus.DEACTIVATED
                        ? "Account switched off"
                        : "Has an account"}
                    </Tag>
                  ) : (
                    <Tag>No account yet</Tag>
                  )}
                </div>
                <ContactForm countryId={country.id} contact={c} />
                <RemoveContactButton contactId={c.id} name={c.name} />
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Add a contact">
        <ContactForm countryId={country.id} />
      </AdminSectionCard>

      <AdminSectionCard
        title={`Accounts for ${country.name} (${country.memberships.length})`}
        description={
          <>
            Accounts are created on the{" "}
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="/admin/accounts"
            >
              accounts page
            </Link>{" "}
            or{" "}
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="/admin/accounts/bulk"
            >
              from a CSV
            </Link>
            .
          </>
        }
      >
        {country.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {country.memberships.map(({ user: member }) => (
              <li key={member.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{member.name}</span>
                <span className="break-all text-muted-foreground">
                  {member.email}
                </span>
                <Tag>{ROLE_LABEL[member.role]}</Tag>
                {member.status !== UserStatus.ACTIVE ? (
                  <Tag>Switched off</Tag>
                ) : null}
                {!country.contacts.some((c) => c.user?.id === member.id) ? (
                  <Tag>Not a contact</Tag>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {country.contacts.some(
          (c) => !c.user && !accountEmails.has(c.email),
        ) ? (
          <p className="text-sm text-muted-foreground">
            Contacts without an account receive no portal access. Create their
            accounts with the same email address.
          </p>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard
        title="Country status"
        description="Switching a country off takes its projects out of the pipeline and stops its upload link. Nothing is deleted."
      >
        <CountryStatusButton
          countryId={country.id}
          name={country.name}
          active={country.status === CountryStatus.ACTIVE}
        />
      </AdminSectionCard>
    </AdminShell>
  );
}
