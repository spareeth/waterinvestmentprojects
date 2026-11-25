import Link from "next/link";
import type { Viewer } from "@/lib/authz";
import { MEETING_SIGNUP } from "@/lib/meetings/schedule";
import { getSignupPanel } from "@/lib/meetings/signups";
import { formatUaeTime } from "@/lib/submission/format";
import { SignupForm } from "./signup-form";

/**
 * "Meet the delegation" on a project page (25 Nov, replaces the per-project meeting request): investors sign up
 * once per country and tick every time they could make inside the country's blocks. Renders nothing for anyone
 * who may not sign up (src/lib/authz/signups.ts).
 */
export async function MeetingSignupPanel({
  viewer,
  projectId,
}: {
  viewer: Viewer;
  projectId: string;
}) {
  const panel = await getSignupPanel(viewer, projectId);
  if (!panel) return null;
  const { country } = panel;
  return (
    <section
      aria-labelledby="meeting-signup-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-6"
    >
      <div>
        <h2 id="meeting-signup-heading" className="text-lg font-semibold">
          Meet the {country.name} delegation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign up once for {country.name}: your sign-up covers all its projects.
          Signing up does not guarantee a meeting. Sign-ups close on{" "}
          {MEETING_SIGNUP.deadlineLabel}; the Summit team then matches investors
          and delegations, and you will receive a meeting confirmation by email
          by {MEETING_SIGNUP.confirmationLabel}.
        </p>
      </div>
      {panel.closed ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          Sign-ups closed on {MEETING_SIGNUP.deadlineLabel}.{" "}
          {panel.signup
            ? `Your sign-up is with the Summit team; you will hear from them by ${MEETING_SIGNUP.confirmationLabel}.`
            : "Contact the Summit team if you would still like a meeting."}
        </p>
      ) : panel.signup ? (
        <p className="rounded-lg border border-success-foreground/30 bg-success px-3 py-2 text-sm text-success-foreground">
          You are signed up for {country.name} (last changed{" "}
          {formatUaeTime(panel.signup.updatedAt)}). You can change your times
          below until sign-ups close.
        </p>
      ) : null}
      <SignupForm
        projectId={projectId}
        countryName={country.name}
        days={panel.days}
        projects={panel.projects}
        defaults={panel.defaults}
        signupId={panel.signup?.id ?? null}
        closed={panel.closed}
      />
      <p className="text-sm">
        <Link href="/requests" className="link">
          See all my sign-ups
        </Link>
      </p>
    </section>
  );
}

/** "Government counterparts at UNWC for this meeting" (25 Nov), from the country's record. */
export function CounterpartsList({
  countryName,
  counterparts,
}: {
  countryName: string;
  counterparts: string[];
}) {
  if (counterparts.length === 0) return null;
  return (
    <section
      aria-labelledby="counterparts-heading"
      className="rounded-xl border bg-card p-6"
    >
      <h2 id="counterparts-heading" className="text-lg font-semibold">
        Government counterparts at UNWC for this meeting
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The {countryName} delegation you would meet.
      </p>
      <ol className="mt-3 flex list-decimal flex-col gap-1 ps-5 text-sm">
        {counterparts.map((line) => (
          <li key={line}>{line.replace(/^\d+[.)]\s*/, "")}</li>
        ))}
      </ol>
    </section>
  );
}
