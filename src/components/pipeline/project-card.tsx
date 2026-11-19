import Link from "next/link";
import type { ReactNode } from "react";
import { formatUsdRange } from "@/lib/pipeline/filters";
import type { PipelineCard } from "@/lib/pipeline/service";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

export function Chip({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "country";
}) {
  return (
    <span
      className={cn(
        chip,
        tone === "country"
          ? "bg-brand-teal/10 text-brand-deep"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** One published teaser in the pipeline grid (mockup 02, without tiers). */
export function ProjectCard({ project }: { project: PipelineCard }) {
  const size = formatUsdRange(project.sizeMinUsd, project.sizeMaxUsd);
  const headingId = `project-${project.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-3 focus-within:ring-brand-aqua/50 hover:shadow-md"
    >
      <div
        aria-hidden="true"
        className="bg-brand-teal/10 px-6 pt-5 pb-0 sm:px-8"
      >
        <div className="flex h-20 flex-col gap-2 rounded-t-md bg-card px-4 pt-4 shadow-sm">
          <span className="h-2 w-1/2 rounded-full bg-brand-teal" />
          <span className="h-1.5 w-full rounded-full bg-muted" />
          <span className="h-1.5 w-3/4 rounded-full bg-muted" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2
          id={headingId}
          className="text-lg leading-snug font-semibold text-brand-navy"
        >
          <Link
            href={`/pipeline/${project.id}`}
            className="outline-none after:absolute after:inset-0"
          >
            {project.title}
          </Link>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="country">{project.country.name}</Chip>
          <Chip>{project.sector}</Chip>
          {project.pppModel ? <Chip>{project.pppModel}</Chip> : null}
          {project.developmentStage ? (
            <Chip>{project.developmentStage}</Chip>
          ) : null}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <p className="text-sm text-muted-foreground">
            {size ?? "Size not stated"}
          </p>
          <span
            aria-hidden="true"
            className="rounded-lg border border-brand-teal px-3 py-1.5 text-sm font-semibold text-brand-teal group-hover:bg-brand-teal group-hover:text-white"
          >
            Open
          </span>
        </div>
      </div>
    </article>
  );
}
