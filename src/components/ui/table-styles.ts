import { cn } from "@/lib/utils";

// Shared look for data tables (design canvas, Nov 2026): a dark header row and alternating light water rows,
// so long lists are easy to follow across the line. A row with its own tone (an error, a draft to review) keeps it.

export const tableFrameClass = "overflow-x-auto rounded-xl border bg-card";

export const tableHeadClass =
  "bg-brand-navy text-xs font-semibold tracking-wide text-white uppercase";

export function tableRowClass(index: number, tone?: string) {
  return cn(
    "border-b border-water-100 transition-colors last:border-0 hover:bg-water-100/70",
    tone || (index % 2 === 1 ? "bg-water-50" : "bg-card"),
  );
}
