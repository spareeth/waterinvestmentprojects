import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CreateAccountForm,
  ResetPasswordForm,
} from "@/components/admin/account-forms";
import { PortalHeader } from "@/components/portal/portal-header";
import { Tag } from "@/components/workspace/status-badge";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { listAccounts, listCountryChoices } from "@/lib/auth/accounts";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { canUseWorkspace, requirePortalUser } from "@/lib/authz";
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
};

/** Admin: create accounts with a temporary password and issue new ones (M2, PLAN 0a.4). */
export default async function AccountsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canManageAccounts(viewer)) notFound();
  const [accounts, countries] = await Promise.all([
    listAccounts(viewer),
    listCountryChoices(viewer),
  ]);

  return (
    <>
      <PortalHeader
        name={user.name}
        viewer={viewer}
        showWorkspace={canUseWorkspace(viewer)}
        showAdmin
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            Accounts
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Accounts are personal and handed out by the Summit team. Create the
            account here, then pass the email address and the temporary password
            on yourself. The person chooses their own password at the first
            sign-in; investors then accept the investor acknowledgement.
          </p>
        </div>

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
