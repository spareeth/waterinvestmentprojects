// Project key fields from the workspace form (PLAN F3 and data model section 5). Pure and browser-safe.
// Sizes are typed in USD million and stored in USD. Empty optional fields are stored as null, so a field can be
// cleared again.

import { z } from "zod";
import { ProjectTier, ProjectType } from "@/generated/prisma/enums";

/** Suggestions for the sector field (free text, so new sectors need no release). */
export const SECTOR_SUGGESTIONS = [
  "Bulk supply and conveyance",
  "Desalination",
  "Irrigation",
  "Network efficiency",
  "Stormwater and flood protection",
  "Wastewater and reuse",
  "Water treatment",
] as const;

export const PPP_MODEL_SUGGESTIONS = [
  "Build, operate, transfer",
  "Build, own, operate",
  "Concession",
  "Design, build, finance, operate",
  "Design, build, operate",
  "Hybrid PPP",
  "Lease",
  "Performance-based contract",
] as const;

export const TIER_LABEL: Record<ProjectTier, string> = {
  TIER1: "Tier 1 · presented at the Summit",
  TIER2: "Tier 2 · listed in the portal",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  SUMMIT_PIPELINE: "Summit pipeline project",
  OTHER_PROPONENT: "Other proponent",
};

/** Form field names, shared by the form and the parser. */
export const PROJECT_FIELDS = [
  "name",
  "sector",
  "tier",
  "projectType",
  "pppModel",
  "sizeMinUsdMillion",
  "sizeMaxUsdMillion",
  "tenderTimeline",
  "documentsPrepared",
  "feedbackSought",
  "revenueModel",
  "counterparty",
  "lat",
  "lon",
] as const;
export type ProjectField = (typeof PROJECT_FIELDS)[number];
export type ProjectFormValues = Partial<Record<ProjectField, string>>;

const MAX_SIZE_MILLION = 100_000;

const requiredText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `Enter the ${label}.`)
    .max(max, `Keep the ${label} to ${max} characters or fewer.`);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} to ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));

function optionalNumber(message: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });
}

const schema = z
  .object({
    name: requiredText("project name", 3, 200),
    sector: requiredText("sector", 2, 100),
    tier: z.enum(ProjectTier, { error: "Choose a tier." }),
    projectType: z.enum(ProjectType, { error: "Choose a project type." }),
    pppModel: optionalText("PPP model", 100),
    sizeMinUsdMillion: optionalNumber(
      `Enter a size between 0 and ${MAX_SIZE_MILLION.toLocaleString("en-GB")} (USD million).`,
      0,
      MAX_SIZE_MILLION,
    ),
    sizeMaxUsdMillion: optionalNumber(
      `Enter a size between 0 and ${MAX_SIZE_MILLION.toLocaleString("en-GB")} (USD million).`,
      0,
      MAX_SIZE_MILLION,
    ),
    tenderTimeline: optionalText("tender timeline", 500),
    documentsPrepared: optionalText("documents prepared", 1000),
    feedbackSought: optionalText("feedback sought", 1000),
    revenueModel: optionalText("revenue model", 500),
    counterparty: optionalText("counterparty", 300),
    lat: optionalNumber("Enter a latitude between -90 and 90.", -90, 90),
    lon: optionalNumber("Enter a longitude between -180 and 180.", -180, 180),
  })
  .superRefine((v, ctx) => {
    if (
      v.sizeMinUsdMillion !== null &&
      v.sizeMaxUsdMillion !== null &&
      v.sizeMaxUsdMillion < v.sizeMinUsdMillion
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sizeMaxUsdMillion"],
        message: "The upper size must not be below the lower size.",
      });
    }
    if ((v.lat === null) !== (v.lon === null)) {
      ctx.addIssue({
        code: "custom",
        path: [v.lat === null ? "lat" : "lon"],
        message: "Enter both latitude and longitude, or neither.",
      });
    }
  });

/** What the service writes to Project. Sizes in whole USD as decimal strings (Prisma Decimal). */
export interface ProjectInput {
  name: string;
  sector: string;
  tier: ProjectTier;
  projectType: ProjectType;
  pppModel: string | null;
  sizeMinUsd: string | null;
  sizeMaxUsd: string | null;
  tenderTimeline: string | null;
  documentsPrepared: string | null;
  feedbackSought: string | null;
  revenueModel: string | null;
  counterparty: string | null;
  lat: number | null;
  lon: number | null;
}

export type ParseResult =
  | { ok: true; data: ProjectInput }
  | { ok: false; fieldErrors: Record<string, string> };

/** USD million (up to 2 decimals) to whole USD, as a string so no float rounding reaches the database. */
export function millionToUsd(million: number | null): string | null {
  if (million === null) return null;
  return String(Math.round(million * 100) * 10_000);
}

/** Stored USD (Decimal or string) to the USD million shown in the form. */
export function usdToMillion(usd: { toString(): string } | null): string {
  if (usd === null) return "";
  const n = Number(usd.toString()) / 1_000_000;
  return String(Math.round(n * 100) / 100);
}

export function parseProjectInput(values: ProjectFormValues): ParseResult {
  const raw = Object.fromEntries(
    PROJECT_FIELDS.map((f) => [f, values[f] ?? ""]),
  );
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const { sizeMinUsdMillion, sizeMaxUsdMillion, ...rest } = result.data;
  return {
    ok: true,
    data: {
      ...rest,
      sizeMinUsd: millionToUsd(sizeMinUsdMillion),
      sizeMaxUsd: millionToUsd(sizeMaxUsdMillion),
    },
  };
}

/** Reads the project fields from a submitted form. */
export function projectValuesFrom(formData: FormData): ProjectFormValues {
  const values: ProjectFormValues = {};
  for (const f of PROJECT_FIELDS) {
    const v = formData.get(f);
    if (typeof v === "string") values[f] = v;
  }
  return values;
}
