import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AuthPage } from "@/components/auth/auth-page";
import { RegisterForm } from "@/components/auth/register-form";
import { getEnv } from "@/lib/env";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Request access" };

/** Self-registration (PLAN F2). Off unless SELF_REGISTRATION_ENABLED=true, in which case this page does not exist. */
export default async function RegisterPage() {
  // Read the setting at request time, not at build time.
  await connection();
  if (!getEnv().SELF_REGISTRATION_ENABLED) notFound();
  return (
    <AuthPage
      title="Request access"
      description="Accounts created here stay inactive until the Summit team approves them. Until then you will not see any projects."
    >
      <RegisterForm />
    </AuthPage>
  );
}
