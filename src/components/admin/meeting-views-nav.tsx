import Link from "next/link";
import { cn } from "@/lib/utils";

// 23 Nov (Sajid): for the Summit team, meeting requests and the meeting calendar are one section, "Meeting
// calendar", with two views: the room calendar and the full list of requests (including requests without a
// time, decisions on behalf of a country, and the CSV download). Countries keep their own "Meeting requests".

const VIEWS = [
  { key: "calendar", href: "/admin/meetings", label: "Calendar" },
  { key: "requests", href: "/inbox", label: "All requests" },
] as const;

export function MeetingViewsNav({
  current,
}: {
  current: (typeof VIEWS)[number]["key"];
}) {
  return (
    <nav aria-label="Meeting views" className="flex flex-wrap gap-2">
      {VIEWS.map((view) => (
        <Link
          key={view.key}
          href={view.href}
          aria-current={view.key === current ? "page" : undefined}
          className={cn(
            "rounded-lg border px-4 py-2 text-sm font-semibold",
            view.key === current
              ? "border-brand-navy bg-brand-navy text-white"
              : "bg-card text-brand-navy hover:bg-muted",
          )}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
