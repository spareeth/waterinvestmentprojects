import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage } from "@/components/auth/auth-page";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthPage
      title="Sign in"
      description="Access is by invitation only. After your password you will be asked for a code from your authenticator app."
      header={
        <Link href="/" className="text-white/90 hover:text-white">
          Home
        </Link>
      }
    >
      <SignInForm />
      <p className="mt-6 text-sm text-muted-foreground">
        New here? Use the personal link in your invitation email to create your
        account. Forgotten your password or lost your phone? Contact the Summit
        team.
      </p>
    </AuthPage>
  );
}
