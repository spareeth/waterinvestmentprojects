import {
  ArrowRight,
  Droplet,
  FlaskConical,
  Gauge,
  type LucideIcon,
  Recycle,
  Sprout,
  Waves,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatUsdRange } from "@/lib/pipeline/filters";
import type { PipelineCard } from "@/lib/pipeline/service";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

/**
 * Colour family and icon per sector, so the grid reads at a glance. The chip always names the sector; colour and
 * icon only help (22 Nov styling pass: a slim chip with an icon instead of a coloured top bar).
 */
const SECTOR_TONES: readonly {
  match: RegExp;
  icon: LucideIcon;
  tag: string;
}[] = [
  {
    match: /non.?revenue|\bnrw\b/i,
    icon: Gauge,
    tag: "bg-water-100 text-water-800",
  },
  {
    match: /waste|sludge|sanit|reuse/i,
    icon: Recycle,
    tag: "bg-[#e6ecf8] text-[#2f4a8a]",
  },
  { match: /desal/i, icon: Waves, tag: "bg-sand-100 text-sand-700" },
  {
    match: /irrigat|agricult/i,
    icon: Sprout,
    tag: "bg-[#e8f2e2] text-[#3a6a2a]",
  },
  {
    match: /treatment/i,
    icon: FlaskConical,
    tag: "bg-water-100 text-water-800",
  },
];

const WATER_TONE = { icon: Droplet, tag: "bg-water-100 text-water-800" };

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

/** One published teaser in the pipeline grid: country, sector chip, title, key facts and "View teaser". */
export function ProjectCard({ project }: { project: PipelineCard }) {
  const size = formatUsdRange(project.sizeMinUsd, project.sizeMaxUsd);
  const headingId = `project-${project.id}`;
  const tone = sectorTone(project.sector);
  const Icon = tone.icon;
  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition duration-200 focus-within:ring-3 focus-within:ring-brand-aqua/50 hover:-translate-y-0.5 hover:border-water-200 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-wider text-water-700 uppercase">
            {project.country.name}
          </span>
          <span
            className={cn(
              "inline-flex max-w-[60%] shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
              tone.tag,
            )}
          >
            <Icon aria-hidden="true" className="size-3 shrink-0" />
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
          <Fact label="Size" value={size ?? "TBC"} />
          <Fact
            label="Stage"
            value={project.developmentStage ?? "Not stated"}
          />
        </dl>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-water-100 px-5 py-3">
        <span className="text-sm text-muted-foreground">One-page teaser</span>
        {/* Looks like a button; the whole card is the link (the title's link covers it). */}
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-brand-deep"
        >
          View teaser
          <ArrowRight className="size-4" />
        </span>
      </div>
    </article>
  );
}
