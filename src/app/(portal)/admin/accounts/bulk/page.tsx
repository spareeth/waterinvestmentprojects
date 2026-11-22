import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSectionCard, AdminShell } from "@/components/admin/admin-shell";
import { BulkAccountsForm } from "@/components/admin/bulk-accounts-form";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { canUseWorkspace, requirePortalUser } from "@/lib/authz";
import { assignableRoles } from "@/lib/authz/account-policies";
import { canBulkCreateAccounts } from "@/lib/authz/admin";
import { appConfig } from "@/lib/config";
import { getEnv } from "@/lib/env";

// Reads the session on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Create accounts from a CSV" };

/** Bulk account hand-out (M7, PLAN v0.3 0a.4 and 0.19). */
export default async function BulkAccountsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canBulkCreateAccounts(viewer)) notFound();
  const signInUrl = new URL("/sign-in", getEnv().APP_URL).toString();
  return (
    <AdminShell
      name={user.name}
      showWorkspace={canUseWorkspace(viewer)}
      current="/admin/accounts"
      title="Create accounts from a CSV"
      intro={`Each account gets its own generated password. Investors and admins change it at the first sign-in to ${appConfig.name}; country and WBG coordinator accounts keep it. Several people may be named for the same country: give each their own row. No emails are sent: you pass the details on yourself.`}
    >
      <AdminSectionCard
        title="The file"
        description={
          <>
            Columns: email, name, organisation, job_title, role, countries.
            Roles:{" "}
            {assignableRoles(viewer)
              .map((r) => ROLE_LABEL[r])
              .join(", ")}
            . Countries (ISO codes separated by semicolons) only for country
            focal points and coordinators. Up to 300 rows per file.
          </>
        }
      >
        <BulkAccountsForm signInUrl={signInUrl} />
      </AdminSectionCard>
    </AdminShell>
  );
}
