import type { ReactNode } from "react";
import type { ProjectStatus, ScanStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STATUS: Record<ProjectStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-foreground" },
  PUBLISHED: {
    label: "In the pipeline",
    className: "bg-success text-success-foreground",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    className: "bg-declined text-declined-foreground",
  },
};

const SCAN: Record<ScanStatus, { label: string; className: string }> = {
  PENDING: {
    label: "Virus check pending",
    className: "bg-pending text-pending-foreground",
  },
  CLEAN: { label: "Checked", className: "bg-success text-success-foreground" },
  INFECTED: {
    label: "Blocked: virus found",
    className: "bg-declined text-declined-foreground",
  },
  FAILED: {
    label: "Virus check failed",
    className: "bg-declined text-declined-foreground",
  },
};

const base =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];
  return <span className={cn(base, s.className)}>{s.label}</span>;
}

export function ScanBadge({ status }: { status: ScanStatus }) {
  const s = SCAN[status];
  return <span className={cn(base, s.className)}>{s.label}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className={cn(base, "bg-secondary text-secondary-foreground")}>
      {children}
    </span>
  );
}
