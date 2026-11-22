import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddContactsForm,
  AddOrganisationForm,
  RemoveFromList,
} from "@/components/admin/registration-forms";
import { PortalHeader } from "@/components/portal/portal-header";
import { Tag } from "@/components/workspace/status-badge";
import { listPreApproved } from "@/lib/admin/registrations";
import { requirePortalUser } from "@/lib/authz";
import { canManagePreApproval } from "@/lib/authz/account-policies";
import { getEnv } from "@/lib/env";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Pre-approved" };

/**
 * Admin: the organisations and people WBG pre-approved for the Summit (M13, PLAN v0.4 0b.18). A registrant whose
 * email is listed, or whose email domain belongs to a listed organisation, is marked as pre-approved; with
 * REGISTRATION_AUTO_APPROVE they get access at once.
 */
export default async function PreApprovedPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canManagePreApproval(viewer)) notFound();
  const { organisations, contacts } = await listPreApproved(viewer);
  const auto = getEnv().REGISTRATION_AUTO_APPROVE;

  return (
    <>
      <PortalHeader name={user.name} viewer={viewer} />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <p className="text-sm">
            <Link href="/admin/accounts" className="link">
              Accounts
            </Link>
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-navy">
            Pre-approved organisations and people
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            The list from WBG. Investors and operators who register with a
            listed email address, or with an address at a listed
            organisation&apos;s email domain, are marked as pre-approved.{" "}
            {auto
              ? "They get access at once (REGISTRATION_AUTO_APPROVE is on)."
              : "They still wait for your approval: immediate access is switched off (REGISTRATION_AUTO_APPROVE), because the portal does not yet check that a registrant owns the address."}{" "}
            Public email services such as gmail.com never match an organisation.
          </p>
        </div>

        <section
          aria-labelledby="orgs-heading"
          className="flex flex-col gap-4 rounded-xl border bg-card p-6"
        >
          <h2 id="orgs-heading" className="text-lg font-semibold">
            Organisations ({organisations.length})
          </h2>
          <AddOrganisationForm />
          {organisations.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {organisations.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold">{o.name}</span>
                    <span className="flex flex-wrap gap-1">
                      {o.emailDomains.length > 0 ? (
                        o.emailDomains.map((d) => <Tag key={d}>{d}</Tag>)
                      ) : (
                        <span className="text-muted-foreground">
                          No domains: only its listed people match.
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {o._count.contacts}{" "}
                      {o._count.contacts === 1 ? "person" : "people"}
                      {o.source ? `. Source: ${o.source}` : ""}
                    </span>
                  </div>
                  <RemoveFromList
                    kind="organisation"
                    id={o.id}
                    label={o.name}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section
          aria-labelledby="contacts-heading"
          className="flex flex-col gap-4 rounded-xl border bg-card p-6"
        >
          <h2 id="contacts-heading" className="text-lg font-semibold">
            People ({contacts.length})
          </h2>
          <AddContactsForm
            organisations={organisations.map((o) => ({
              id: o.id,
              name: o.name,
            }))}
          />
          {contacts.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {contacts.map((c) => (
                <li
                  key={c.email}
                  className="flex items-start justify-between gap-3 p-3 text-sm"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="break-all">{c.email}</span>
                    {c.organisation ? (
                      <span className="text-xs text-muted-foreground">
                        {c.organisation.name}
                      </span>
                    ) : null}
                  </div>
                  <RemoveFromList kind="contact" id={c.email} label={c.email} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </>
  );
}
