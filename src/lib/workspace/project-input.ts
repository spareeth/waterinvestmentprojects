// Project key fields from the workspace form (PLAN v0.3 F3/F7 and data model section 6). Pure and browser-safe.
// PLAN v0.3: governments only give country and sector; PPP model, size and development stage are entered by the
// admin team from the teasers. No tiers. Sizes are typed in USD million and stored in USD. Empty optional fields
// are stored as null, so a field can be cleared again.

import { z } from "zod";
import { ProjectType } from "@/generated/prisma/enums";

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

/** Suggestions for the development stage (free text until WBG confirms the list). */
export const DEVELOPMENT_STAGE_SUGGESTIONS = [
  "Concept",
  "Pre-feasibility",
  "Feasibility",
  "Transaction structuring",
  "Procurement",
  "Financial close",
] as const;

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  SUMMIT_PIPELINE: "Summit pipeline project",
  OTHER_PROPONENT: "Other proponent",
};

/** Form field names, shared by the form and the parser. */
export const PROJECT_FIELDS = [
  "title",
  "sector",
  "projectType",
  "pppModel",
  "sizeMinUsdMillion",
  "sizeMaxUsdMillion",
  "developmentStage",
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
    title: requiredText("project title", 3, 200),
    sector: requiredText("sector", 2, 100),
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
    developmentStage: optionalText("development stage", 100),
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
  });

/** What the service writes to Project. Sizes in whole USD as decimal strings (Prisma Decimal). */
export interface ProjectInput {
  title: string;
  sector: string;
  projectType: ProjectType;
  pppModel: string | null;
  sizeMinUsd: string | null;
  sizeMaxUsd: string | null;
  developmentStage: string | null;
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
