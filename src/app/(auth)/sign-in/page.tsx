import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentSession, stagePathForUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

// Reads the session on the server and may redirect, so it renders per request.
export const instant = false;

export default async function SignInPage() {
  // Already signed in: go straight on (portal home, or the next step such as the password change).
  const session = await getCurrentSession();
  if (session) redirect(await stagePathForUser(session.user.id));
  return (
    <AuthPage
      title="Sign in"
      description="Access is by invitation only. Sign in with your email address and your password."
      header={
        <Link href="/" className="text-white/90 hover:text-white">
          Home
        </Link>
      }
    >
      <SignInForm />
      <p className="mt-6 text-sm text-muted-foreground">
        New here? The Summit team creates your account and gives you a temporary
        password, which you change when you first sign in. Forgotten your
        password? Contact the Summit team for a new temporary one.
      </p>
    </AuthPage>
  );
}
