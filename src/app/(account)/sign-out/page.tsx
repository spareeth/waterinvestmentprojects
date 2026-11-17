import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireSession } from "@/lib/authz";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Sign out" };

export default async function SignOutPage() {
  const { user } = await requireSession();
  return (
    <AuthPage
      title="Sign out"
      description={`You are signed in as ${user.email}.`}
      header={<AccountHeader name={user.name} />}
    >
      <SignOutButton variant="primary" />
    </AuthPage>
  );
}
