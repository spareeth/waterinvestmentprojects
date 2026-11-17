import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { AuthPage } from "@/components/auth/auth-page";
import { Button } from "@/components/ui/button";
import {
  describeInvitation,
  type InvitationState,
} from "@/lib/auth/invitations";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = {
  title: "Accept your invitation",
  // The token is in the URL: never send it to another site in a Referer header.
  referrer: "no-referrer",
};

const ROLE_LABEL = {
  PLATFORM_ADMIN: "platform administrator",
  SUMMIT_ADMIN: "Summit team member",
  COUNTRY: "country representative",
  INVESTOR: "investor or operator",
} as const;

const PROBLEMS: Record<
  Exclude<InvitationState, "valid">,
  { title: string; body: string }
> = {
  not_found: {
    title: "Invitation not found",
    body: "This link is not valid. Check that you copied the whole link from your invitation email.",
  },
  accepted: {
    title: "Invitation already used",
    body: "This invitation has already been used to create an account. Please sign in.",
  },
  expired: {
    title: "Invitation expired",
    body: "This invitation is no longer valid. Please ask the Summit team to send you a new one.",
  },
  account_exists: {
    title: "You already have an account",
    body: "An account already exists for this email address. Please sign in.",
  },
};

export default async function InvitationPage({
  params,
}: PageProps<"/invitation/[token]">) {
  // Invitation state depends on the clock and the database: always render per request.
  await connection();
  const { token } = await params;
  const invitation = await describeInvitation(decodeURIComponent(token));

  if (invitation.state !== "valid" || !invitation.email || !invitation.role) {
    const problem =
      PROBLEMS[invitation.state === "valid" ? "not_found" : invitation.state];
    return (
      <AuthPage title={problem.title} description={problem.body}>
        <Button asChild size="lg" className="h-10 w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      title="Accept your invitation"
      description={
        <>
          You have been invited as {ROLE_LABEL[invitation.role]}
          {invitation.countryName ? ` for ${invitation.countryName}` : ""}.
          Create your account, then set up two-step verification.
        </>
      }
    >
      <AcceptInvitationForm
        token={decodeURIComponent(token)}
        email={invitation.email}
      />
    </AuthPage>
  );
}
