import type { MeetingRequestStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STATUS: Record<
  MeetingRequestStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Awaiting reply",
    className: "bg-pending text-pending-foreground",
  },
  ACCEPTED: {
    label: "Accepted",
    className: "bg-success text-success-foreground",
  },
  DECLINED: {
    label: "Declined",
    className: "bg-declined text-declined-foreground",
  },
  WITHDRAWN: { label: "Withdrawn", className: "bg-muted text-foreground" },
};

export function RequestStatusBadge({
  status,
}: {
  status: MeetingRequestStatus;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

export function NewMarker() {
  return (
    <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
      New
    </span>
  );
}
