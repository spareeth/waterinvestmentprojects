import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage } from "@/components/auth/auth-page";
import { SecondStepForm } from "@/components/auth/second-step-form";

export const metadata: Metadata = { title: "Two-step verification" };

export default function SecondStepPage() {
  return (
    <AuthPage
      title="Two-step verification"
      description="Enter the code from your authenticator app to finish signing in."
    >
      <SecondStepForm />
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/sign-in" className="link">
          Start again
        </Link>
      </p>
    </AuthPage>
  );
}
