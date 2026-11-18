import type { SubmissionCounts } from "@/lib/submission/service";
import { NEW_SUBMISSION_HOURS } from "@/lib/submission/service";

/**
 * The admin notification for now (no email, user decision 18 Nov): totals, and how many submissions arrived in
 * the last day. Shown on the home page and the submissions page.
 */
export function SubmissionSummary({ counts }: { counts: SubmissionCounts }) {
  const items = [
    {
      label: `New in the last ${NEW_SUBMISSION_HOURS} hours`,
      value: counts.recent,
      highlight: counts.recent > 0,
    },
    { label: "Submissions", value: counts.submissions, highlight: false },
    { label: "Teasers", value: counts.teasers, highlight: false },
    {
      label: "Countries that have sent teasers",
      value: `${counts.countriesWithSubmissions} of ${counts.activeCountries}`,
      highlight: false,
    },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-xl border p-4 ${item.highlight ? "border-success-foreground/30 bg-success text-success-foreground" : "bg-card"}`}
        >
          <dt className="text-xs font-semibold uppercase">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
