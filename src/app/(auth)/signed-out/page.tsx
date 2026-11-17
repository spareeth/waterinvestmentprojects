import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage } from "@/components/auth/auth-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Signed out" };

export default function SignedOutPage() {
  return (
    <AuthPage
      title="You have signed out"
      description="For your security, close the browser if you are using a shared computer."
    >
      <Button asChild size="lg" className="h-10 w-full">
        <Link href="/sign-in">Sign in again</Link>
      </Button>
    </AuthPage>
  );
}
