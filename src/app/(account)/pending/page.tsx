import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { UserStatus } from "@/generated/prisma/enums";
import { requireStage } from "@/lib/authz";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Waiting for approval" };

/** The only screen an account waiting for approval (or one the Summit team declined, M13) can see. */
export default async function PendingPage() {
  const { user } = await requireStage("pending");
  const rejected = user.status === UserStatus.REJECTED;
  return (
    <AuthPage
      title={rejected ? "Registration not approved" : "Waiting for approval"}
      description={
        rejected
          ? "The Summit team was not able to approve access for this account. If you think this is a mistake, please contact the Summit team."
          : "Thank you for registering. The Summit team checks each registration and will let you know when your access is approved. Until then you will not see any projects."
      }
      header={<AccountHeader name={user.name} />}
    >
      <SignOutButton variant="primary" />
    </AuthPage>
  );
}
