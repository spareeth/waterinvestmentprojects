import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CreateAccountForm,
  ResetPasswordForm,
} from "@/components/admin/account-forms";
import { RegistrationDecision } from "@/components/admin/registration-forms";
import { listPendingRegistrations } from "@/lib/admin/registrations";
import { ORGANISATION_TYPE_LABEL } from "@/lib/auth/pre-approval";
import { PortalHeader } from "@/components/portal/portal-header";
import { Tag } from "@/components/workspace/status-badge";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { listAccounts, listCountryChoices } from "@/lib/auth/accounts";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { requirePortalUser } from "@/lib/authz";
import {
  assignableRoles,
  canManageAccounts,
} from "@/lib/authz/account-policies";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Accounts" };

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  PENDING_APPROVAL: "Waiting for approval",
  DEACTIVATED: "Switched off",
  REJECTED: "Registration rejected",
};

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dubai",
});

/** Admin: create accounts with a temporary password and issue new ones (M2, PLAN 0a.4). */
export default async function AccountsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canManageAccounts(viewer)) notFound();
  const [accounts, countries, pending] = await Promise.all([
    listAccounts(viewer),
    listCountryChoices(viewer),
    listPendingRegistrations(viewer),
  ]);

  return (
    <>
      <PortalHeader name={user.name} viewer={viewer} />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            Accounts
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Accounts are personal and handed out by the Summit team. Create the
            account here, then pass the email address and the temporary password
            on yourself. Investors and admins choose their own password at the
            first sign-in (investors then accept the investor acknowledgement).
            Country and WBG coordinator accounts keep the password they are
            given, because WBG colleagues may share the account with the
            government; issue a new one if it is lost or passed on.
          </p>
        </div>

        <section
          aria-labelledby="pending-heading"
          className="flex flex-col gap-4 rounded-xl border bg-card p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pending-heading" className="text-lg font-semibold">
              Registrations waiting for approval ({pending.length})
            </h2>
            <Link
              href="/admin/pre-approved"
              className="text-sm font-medium text-brand-teal hover:underline"
            >
              Pre-approved organisations and people
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No registration is waiting. Investors and operators register at
              /register; each one waits here until you approve or reject it.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.name}</span>
                      <Tag>{r.preApproval}</Tag>
                    </div>
                    <span className="break-all text-muted-foreground">
                      {r.email}
                    </span>
                    <span>
                      {[
                        r.jobTitle,
                        r.organisation,
                        r.organisationType
                          ? ORGANISATION_TYPE_LABEL[r.organisationType]
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Registered {dateTime.format(r.createdAt)} (UAE time)
                    </span>
                  </div>
                  <RegistrationDecision userId={r.id} name={r.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">New account</h2>
          <CreateAccountForm
            roles={assignableRoles(viewer)}
            countries={countries}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            All accounts ({accounts.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{account.name}</span>
                    <Tag>{ROLE_LABEL[account.role]}</Tag>
                    {account.status !== UserStatus.ACTIVE ? (
                      <Tag>{STATUS_LABEL[account.status]}</Tag>
                    ) : null}
                    {account.mustChangePassword ? (
                      <Tag>Temporary password</Tag>
                    ) : null}
                    {account.role === UserRole.INVESTOR &&
                    !account.investorAckAcceptedAt ? (
                      <Tag>Acknowledgement not yet accepted</Tag>
                    ) : null}
                  </div>
                  <span className="text-sm break-all text-muted-foreground">
                    {account.email}
                    {account.organisation ? `, ${account.organisation}` : ""}
                  </span>
                  {account.countries.length > 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {account.countries.map((c) => c.name).join(", ")}
                    </span>
                  ) : null}
                </div>
                {account.canReset ? (
                  <div className="sm:max-w-sm">
                    <ResetPasswordForm
                      userId={account.id}
                      name={account.name}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
