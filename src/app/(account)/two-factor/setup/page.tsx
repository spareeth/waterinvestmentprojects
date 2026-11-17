import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { EnrolmentForm } from "@/components/auth/enrolment-form";
import { requireStage } from "@/lib/authz";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Set up two-step verification" };

export default async function EnrolmentPage() {
  const { user } = await requireStage("enrol-2fa");
  return (
    <AuthPage
      wide
      title="Set up two-step verification"
      description="Every account is protected by a second step at sign-in: a code from an authenticator app on your phone. This takes about two minutes."
      header={<AccountHeader name={user.name} />}
    >
      <EnrolmentForm />
    </AuthPage>
  );
}
