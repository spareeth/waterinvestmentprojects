import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireStage } from "@/lib/authz";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Waiting for approval" };

/** The only screen an account waiting for approval can see. */
export default async function PendingPage() {
  const { user } = await requireStage("pending");
  return (
    <AuthPage
      title="Waiting for approval"
      description="Thank you for registering. The Summit team will review your request. You will be able to see the project pipeline once your account is approved."
      header={<AccountHeader name={user.name} />}
    >
      <SignOutButton variant="primary" />
    </AuthPage>
  );
}
