import Link from "next/link";
import type { ReactNode } from "react";
import { formatUsdRange } from "@/lib/pipeline/filters";
import type { PipelineCard } from "@/lib/pipeline/service";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** Colour family per sector, so the grid reads at a glance. The tag always names the sector; colour only helps. */
const SECTOR_TONES = [
  {
    match: /waste|sludge|sanit|reuse/i,
    stripe: "bg-[#4f6fb3]",
    tag: "bg-[#e6ecf8] text-[#2f4a8a]",
  },
  { match: /desal/i, stripe: "bg-sand-500", tag: "bg-sand-100 text-sand-700" },
  {
    match: /irrigat|agricult/i,
    stripe: "bg-[#4f8a3a]",
    tag: "bg-[#e8f2e2] text-[#3a6a2a]",
  },
] as const;

const WATER_TONE = {
  stripe: "bg-water-500",
  tag: "bg-water-100 text-water-800",
};

export function sectorTone(sector: string) {
  return SECTOR_TONES.find((t) => t.match.test(sector)) ?? WATER_TONE;
}

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
          ? "bg-brand-navy text-white"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-water-50 px-2.5 py-2">
      <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-words text-water-800">
        {value}
      </dd>
    </div>
  );
}

/** One published teaser in the pipeline grid: sector stripe, country, title and key facts. */
export function ProjectCard({ project }: { project: PipelineCard }) {
  const size = formatUsdRange(project.sizeMinUsd, project.sizeMaxUsd);
  const headingId = `project-${project.id}`;
  const tone = sectorTone(project.sector);
  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-3 focus-within:ring-brand-aqua/50 hover:border-water-200 hover:shadow-md"
    >
      <div aria-hidden="true" className={cn("h-1.5", tone.stripe)} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="pt-0.5 text-xs font-bold tracking-wider text-water-600 uppercase">
            {project.country.name}
          </span>
          <span className={cn(chip, "shrink-0", tone.tag)}>
            <span className="truncate">{project.sector}</span>
          </span>
        </div>
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
        <dl className="mt-auto grid grid-cols-3 gap-2 pt-1">
          <Fact label="PPP model" value={project.pppModel ?? "Not stated"} />
          <Fact label="Size" value={size ?? "Not stated"} />
          <Fact
            label="Stage"
            value={project.developmentStage ?? "Not stated"}
          />
        </dl>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-water-100 bg-water-50/70 px-5 py-3">
        <span className="text-sm text-muted-foreground">One-page teaser</span>
        <span
          aria-hidden="true"
          className="text-sm font-semibold text-water-600 group-hover:text-brand-navy"
        >
          View teaser →
        </span>
      </div>
    </article>
  );
}
