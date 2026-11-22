import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentSession, stagePathForUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

// Reads the session on the server and may redirect, so it renders per request.
export const instant = false;

/**
 * M13 (PLAN v0.4 0b.17): one sign-in form for everyone, with the three ways in shown above it. What a person sees
 * after signing in follows from their account's role, never from the option chosen here: the option only changes
 * the guidance (and offers registration to investors and operators).
 */
const OPTIONS = {
  country: {
    label: "Government or country",
    hint: "Sign in with the account the Summit team gave you for your country. Project teasers are uploaded through your country's upload link.",
  },
  investor: {
    label: "Investor or operator",
    hint: "Sign in with the email address and password you registered with, or that the Summit team gave you.",
  },
  team: {
    label: "Summit team",
    hint: "Sign in with your Summit team account.",
  },
} as const;
type Option = keyof typeof OPTIONS;

function isOption(value: unknown): value is Option {
  return typeof value === "string" && value in OPTIONS;
}

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  // Already signed in: go straight on (portal home, or the next step such as the password change).
  const session = await getCurrentSession();
  if (session) redirect(await stagePathForUser(session.user.id));
  const as = (await searchParams).as;
  const chosen = isOption(as) ? as : null;
  const registration = getEnv().SELF_REGISTRATION_ENABLED;
  return (
    <AuthPage
      title="Sign in"
      description="Choose how you take part, then sign in with your email address and password."
      header={
        <Link href="/" className="text-white/90 hover:text-white">
          Home
        </Link>
      }
    >
      <nav aria-label="I am signing in as" className="mb-6">
        <ul className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(OPTIONS) as Option[]).map((key) => (
            <li key={key}>
              <Link
                href={`/sign-in?as=${key}`}
                aria-current={chosen === key ? "true" : undefined}
                className={cn(
                  "flex h-full items-center justify-center rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors hover:border-brand-teal focus-visible:ring-3 focus-visible:ring-brand-teal/40 focus-visible:outline-none",
                  chosen === key
                    ? "border-brand-teal bg-water-50 text-brand-navy"
                    : "bg-card text-foreground/80",
                )}
              >
                {OPTIONS[key].label}
              </Link>
            </li>
          ))}
        </ul>
        {chosen ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {OPTIONS[chosen].hint}
          </p>
        ) : null}
      </nav>
      <SignInForm />
      {chosen === "investor" || chosen === null ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Investor or operator and new here?{" "}
          {registration ? (
            <Link
              href="/register"
              className="font-medium text-brand-deep underline underline-offset-4"
            >
              Register here
            </Link>
          ) : (
            "Ask the Summit team for an account"
          )}
          . Governments and the Summit team get their accounts from the Summit
          team.
        </p>
      ) : null}
      <p className="mt-3 text-sm text-muted-foreground">
        Forgotten your password? Contact the Summit team for a new temporary
        one.
      </p>
    </AuthPage>
  );
}
