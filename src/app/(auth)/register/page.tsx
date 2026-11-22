import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AuthPage } from "@/components/auth/auth-page";
import { RegisterForm } from "@/components/auth/register-form";
import { getEnv } from "@/lib/env";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Register" };

/**
 * Investor and operator registration (M13, PLAN v0.4 0b.17 to 0b.19). The page does not exist when
 * SELF_REGISTRATION_ENABLED is "false". Governments and the Summit team get their accounts from the Summit team.
 */
export default async function RegisterPage() {
  // Read the setting at request time, not at build time.
  await connection();
  if (!getEnv().SELF_REGISTRATION_ENABLED) notFound();
  return (
    <AuthPage
      title="Register as an investor or operator"
      description="Register to see the published project teasers and request meetings at the Water Investment Summit. The Summit team checks each registration; you can see the projects once your access is approved."
      header={
        <Link href="/" className="text-white/90 hover:text-white">
          Home
        </Link>
      }
    >
      <RegisterForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Already registered?{" "}
        <Link
          href="/sign-in?as=investor"
          className="font-medium text-brand-deep underline underline-offset-4"
        >
          Sign in
        </Link>
        . Representing a government? The Summit team gives you your account.
      </p>
    </AuthPage>
  );
}
