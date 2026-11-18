import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireStage } from "@/lib/authz";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Choose your password" };

/** First sign-in after an admin handed out a temporary password (PLAN 0a.4). */
export default async function ChangePasswordPage() {
  const { user } = await requireStage("change-password");
  return (
    <AuthPage
      title="Choose your password"
      description="You signed in with a temporary password. Please choose your own password now; the temporary one stops working."
      header={<AccountHeader name={user.name} />}
    >
      <ChangePasswordForm email={user.email} />
    </AuthPage>
  );
}
