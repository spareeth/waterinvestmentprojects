import Link from "next/link";
import {
  formatSignupSlot,
  formatMeetingDay,
  uaeDateKey,
} from "@/lib/meetings/schedule";
import { formatUaeTime } from "@/lib/submission/format";
import { cn } from "@/lib/utils";

// A list of meeting sign-ups (25 Nov): for the investor (their own, with a link to change them) and for countries,
// coordinators and admins (their countries', read only). The rows come from the sign-up service, already scoped by
// the policy module.

export interface SignupRow {
  id: string;
  status: "ACTIVE" | "WITHDRAWN";
  contactName: string;
  contactEmail: string;
  organisation: string;
  role: string;
  note: string;
  slotStarts: Date[];
  createdAt: Date;
  updatedAt: Date;
  country: { id: string; name: string };
  requester: { name: string; email: string };
  projects: { project: { id: string; title: string } }[];
}

/** The chosen times grouped by day: "Tuesday 8 December: 09:00–09:20, 09:30–09:50". */
function timesByDay(starts: Date[]): { day: string; times: string }[] {
  const days = new Map<string, { day: string; times: string[] }>();
  for (const start of [...starts].sort((a, b) => a.getTime() - b.getTime())) {
    const key = uaeDateKey(start);
    const entry = days.get(key) ?? {
      day: formatMeetingDay(start),
      times: [],
    };
    entry.times.push(formatSignupSlot(start));
    days.set(key, entry);
  }
  return [...days.values()].map((d) => ({
    day: d.day,
    times: d.times.join(", "),
  }));
}

export function SignupList({
  rows,
  mine = false,
  empty,
}: {
  rows: SignupRow[];
  /** The investor's own list: show the country and a link to change it, not the requester. */
  mine?: boolean;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => {
        const active = r.status === "ACTIVE";
        const firstProject = r.projects[0]?.project;
        return (
          <li
            key={r.id}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-card p-5",
              !active && "opacity-75",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-brand-navy">
                {mine ? r.country.name : r.organisation}
              </h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  active
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {active ? "Signed up" : "Withdrawn"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {mine ? null : <>{r.country.name} · </>}
              Signed up {formatUaeTime(r.createdAt)}
              {r.updatedAt.getTime() - r.createdAt.getTime() > 1000
                ? ` · last changed ${formatUaeTime(r.updatedAt)}`
                : ""}
            </p>
            <p className="text-sm">
              {r.contactName} (
              <a href={`mailto:${r.contactEmail}`} className="link break-all">
                {r.contactEmail}
              </a>
              ), {r.role}, {r.organisation}
            </p>
            {r.projects.length > 0 ? (
              <p className="text-sm">
                <span className="font-semibold">Projects:</span>{" "}
                {r.projects.map((p) => p.project.title).join("; ")}
              </p>
            ) : null}
            <div className="rounded-lg bg-water-50 px-3 py-2 text-sm">
              <p className="font-semibold text-brand-navy">
                Times they can meet ({r.slotStarts.length}):
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {timesByDay(r.slotStarts).map((d) => (
                  <li key={d.day}>
                    <span className="font-medium">{d.day}:</span> {d.times}
                  </li>
                ))}
              </ul>
            </div>
            {r.note ? (
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {r.note}
              </p>
            ) : null}
            {mine && active && firstProject ? (
              <p className="text-sm">
                <Link href={`/pipeline/${firstProject.id}`} className="link">
                  Change my times for {r.country.name}
                </Link>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
