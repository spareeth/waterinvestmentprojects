import { Briefcase, Check, Landmark, Users } from "lucide-react";
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
    icon: Landmark,
    hint: "Sign in with the account the Summit team gave you for your country. Add project teasers under My projects, or through your country's upload link.",
  },
  investor: {
    label: "Investor or operator",
    icon: Briefcase,
    hint: "Sign in with the email address and password you registered with, or that the Summit team gave you.",
  },
  team: {
    label: "Summit team",
    icon: Users,
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
      aside={{
        headline: "The Summit's water project pipeline, in one place",
        text: "Participating governments share their project teasers; invited investors and operators review them and request bilateral meetings.",
        points: [
          "Personal, invitation-only access",
          "One-page teasers from participating governments",
          "Bilateral meetings booked through the portal",
        ],
      }}
    >
      <nav aria-label="I am signing in as" className="mb-6">
        <p className="mb-2 text-sm font-semibold text-foreground">
          I am signing in as
        </p>
        {/* Segmented buttons (22 Nov styling pass): an icon each and an obvious selected state. */}
        <ul className="grid gap-1 rounded-xl bg-muted p-1 sm:grid-cols-3">
          {(Object.keys(OPTIONS) as Option[]).map((key) => {
            const Icon = OPTIONS[key].icon;
            const selected = chosen === key;
            return (
              <li key={key}>
                <Link
                  href={`/sign-in?as=${key}`}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "relative flex h-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-brand-teal/50 focus-visible:outline-none sm:flex-col sm:justify-center sm:gap-1.5 sm:text-center",
                    selected
                      ? "bg-card font-semibold text-brand-navy shadow-sm ring-2 ring-brand-teal"
                      : "text-foreground/80 hover:bg-card/70 hover:text-brand-navy",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-5 shrink-0",
                      selected ? "text-brand-deep" : "text-muted-foreground",
                    )}
                  />
                  {OPTIONS[key].label}
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 size-3.5 text-brand-deep"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
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
            <Link href="/register" className="link">
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
