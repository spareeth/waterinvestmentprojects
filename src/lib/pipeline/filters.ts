// Pipeline filters (PLAN v0.3 F3): country, sector, PPP model, size and development stage, plus a search on title
// or country. Pure and browser-safe. Filters live in the URL query so a filtered view can be shared and the back
// button works.
//
// Filters only ever NARROW a query. The service ANDs pipelineFilterWhere() with the policy module's projectWhere(),
// so no value in the URL can widen what the viewer sees (CLAUDE.md: default deny, single policy module).

import type { Prisma } from "@/generated/prisma/client";

/** Size buckets in USD. A project matches a bucket when its indicative range overlaps it. */
export const SIZE_BUCKETS = {
  lt50: { label: "Under USD 50 million", min: 0, max: 50_000_000 },
  "50-100": {
    label: "USD 50 to 100 million",
    min: 50_000_000,
    max: 100_000_000,
  },
  "100-250": {
    label: "USD 100 to 250 million",
    min: 100_000_000,
    max: 250_000_000,
  },
  gte250: { label: "USD 250 million and above", min: 250_000_000, max: null },
} as const satisfies Record<
  string,
  { label: string; min: number; max: number | null }
>;

export type SizeBucket = keyof typeof SIZE_BUCKETS;
export const SIZE_BUCKET_KEYS = Object.keys(SIZE_BUCKETS) as SizeBucket[];

export interface PipelineFilters {
  /** Search on project title or country name. */
  q?: string;
  /** Country ISO3 code, upper case. */
  country?: string;
  sector?: string;
  ppp?: string;
  stage?: string;
  size?: SizeBucket;
}

/** The URL query keys, in the order they are written. */
export const FILTER_KEYS = [
  "q",
  "country",
  "sector",
  "ppp",
  "stage",
  "size",
] as const satisfies readonly (keyof PipelineFilters)[];

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const MAX_TEXT = 120;

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  // Collapse whitespace and drop control characters; an empty value means "no filter".
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
  return cleaned === "" ? undefined : cleaned;
}

/**
 * Reads the filters from the page's search params. Only the first value of a repeated key counts; anything that
 * is not a valid value (a malformed country code, an unknown size bucket) is dropped rather than rejected, so an
 * edited or old URL still shows a page.
 */
export function parsePipelineFilters(
  params: SearchParamsRecord | URLSearchParams,
): PipelineFilters {
  const get = (key: string) =>
    params instanceof URLSearchParams
      ? firstValue(params.getAll(key))
      : firstValue(params[key]);
  const filters: PipelineFilters = {};
  const q = get("q");
  if (q) filters.q = q;
  const country = get("country");
  if (country && /^[A-Za-z]{3}$/.test(country)) {
    filters.country = country.toUpperCase();
  }
  const sector = get("sector");
  if (sector) filters.sector = sector;
  const ppp = get("ppp");
  if (ppp) filters.ppp = ppp;
  const stage = get("stage");
  if (stage) filters.stage = stage;
  const size = get("size");
  if (size && (SIZE_BUCKET_KEYS as string[]).includes(size)) {
    filters.size = size as SizeBucket;
  }
  return filters;
}

export function hasActiveFilters(filters: PipelineFilters): boolean {
  return FILTER_KEYS.some((key) => filters[key] !== undefined);
}

/** "/pipeline?country=XAA&size=lt50", with the keys in a stable order; "/pipeline" without filters. */
export function pipelineHref(filters: PipelineFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/pipeline?${query}` : "/pipeline";
}

/** The overlap condition between a project's indicative USD range and a size bucket. */
export function sizeBucketWhere(bucket: SizeBucket): Prisma.ProjectWhereInput {
  const { min, max } = SIZE_BUCKETS[bucket];
  // A project with only one bound is treated as that single value.
  const conditions: Prisma.ProjectWhereInput[] = [
    {
      OR: [
        { sizeMaxUsd: { gte: min } },
        { sizeMaxUsd: null, sizeMinUsd: { gte: min } },
      ],
    },
  ];
  if (max !== null) {
    conditions.push({
      OR: [
        { sizeMinUsd: { lt: max } },
        { sizeMinUsd: null, sizeMaxUsd: { lt: max } },
      ],
    });
  }
  return { AND: conditions };
}

/**
 * The filters as a Prisma where. It narrows only; always AND it with the policy module's projectWhere(viewer).
 * Sector, PPP model and stage match exactly (the options come from the data); the search matches part of the
 * title or the country name, ignoring case.
 */
export function pipelineFilterWhere(
  filters: PipelineFilters,
): Prisma.ProjectWhereInput {
  const conditions: Prisma.ProjectWhereInput[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { country: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  if (filters.country) conditions.push({ country: { iso3: filters.country } });
  if (filters.sector) conditions.push({ sector: filters.sector });
  if (filters.ppp) conditions.push({ pppModel: filters.ppp });
  if (filters.stage) conditions.push({ developmentStage: filters.stage });
  if (filters.size) conditions.push(sizeBucketWhere(filters.size));
  return { AND: conditions };
}

function formatAmount(usd: number): { value: string; unit: string } {
  const million = usd / 1_000_000;
  if (million >= 1000) {
    return {
      value: (million / 1000).toFixed(1).replace(/\.0$/, ""),
      unit: "billion",
    };
  }
  const rounded =
    million >= 10
      ? Math.round(million).toString()
      : million.toFixed(1).replace(/\.0$/, "");
  return { value: rounded, unit: "million" };
}

/** "USD 180 to 220 million", "USD 60 million", "Up to USD 90 million"; null when no size is known. */
export function formatUsdRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) {
    const a = formatAmount(Math.min(min, max));
    const b = formatAmount(Math.max(min, max));
    return a.unit === b.unit
      ? `USD ${a.value} to ${b.value} ${b.unit}`
      : `USD ${a.value} ${a.unit} to ${b.value} ${b.unit}`;
  }
  if (min !== null && max !== null) {
    const a = formatAmount(min);
    return `USD ${a.value} ${a.unit}`;
  }
  if (min !== null) {
    const a = formatAmount(min);
    return `From USD ${a.value} ${a.unit}`;
  }
  const b = formatAmount(max as number);
  return `Up to USD ${b.value} ${b.unit}`;
}
