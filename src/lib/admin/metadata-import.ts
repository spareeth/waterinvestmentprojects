// CSV import of the project filters that the WBG team prepares from the teasers (M7, PLAN v0.3 0.5 and F7):
// PPP model, size and development stage, and since M11 the region (PLAN v0.4 0b.8). Pure and browser-safe: the
// server applies the plan in src/lib/admin/projects.ts.
//
// Rules (user decision, 18 Nov):
// - A row is matched by project_id (from the projects export). Without an id, by country ISO3 + exact title, only
//   when exactly one project matches.
// - Only the four metadata columns are ever written. Every other column (title, sector, status, ...) is read for
//   matching or ignored, so the import cannot change anything else.
// - An empty cell leaves the stored value unchanged; a single "-" clears it.
// - Same limits as the project form: text up to 100 characters, sizes 0 to 100,000 USD million, the upper size not
//   below the lower one (checked after merging with the stored values).

import {
  DEVELOPMENT_STAGE_SUGGESTIONS,
  millionToUsd,
  PPP_MODEL_SUGGESTIONS,
  usdToMillion,
} from "@/lib/workspace/project-input";
import { cellOf, type CsvTable, findColumn } from "./csv-parse";

export const METADATA_IMPORT_MAX_ROWS = 2_000;
export const CLEAR_MARKER = "-";
const MAX_TEXT = 100;
const MAX_SIZE_MILLION = 100_000;

/** Columns of the projects export (src/lib/admin/exports.ts), which doubles as the import template. */
export const PROJECT_EXPORT_HEADER = [
  "project_id",
  "country",
  "iso3",
  "title",
  "sector",
  "region",
  "project_type",
  "ppp_model",
  "size_min_usd_million",
  "size_max_usd_million",
  "development_stage",
  "status",
  "published_at",
  "teaser_file",
  "teaser_version",
] as const;

const ID_COLUMNS = ["project_id", "id"] as const;
const ISO3_COLUMNS = ["iso3", "country_iso3"] as const;
const TITLE_COLUMNS = ["title", "project_title", "project"] as const;

export const METADATA_FIELDS = [
  "region",
  "pppModel",
  "sizeMinUsd",
  "sizeMaxUsd",
  "developmentStage",
] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];

export const METADATA_COLUMN: Record<MetadataField, string> = {
  region: "region",
  pppModel: "ppp_model",
  sizeMinUsd: "size_min_usd_million",
  sizeMaxUsd: "size_max_usd_million",
  developmentStage: "development_stage",
};

export const METADATA_LABEL: Record<MetadataField, string> = {
  region: "Region",
  pppModel: "PPP model",
  sizeMinUsd: "Size from (USD million)",
  sizeMaxUsd: "Size to (USD million)",
  developmentStage: "Development stage",
};

/** What the plan needs about each project. Sizes as stored: whole USD as decimal strings, or null. */
export interface ProjectSnapshot {
  id: string;
  iso3: string;
  countryName: string;
  title: string;
  region: string | null;
  pppModel: string | null;
  sizeMinUsd: string | null;
  sizeMaxUsd: string | null;
  developmentStage: string | null;
  /** ISO time of the last change, so the apply step can tell whether the project changed since the preview. */
  updatedAt: string;
}

export interface FieldChange {
  field: MetadataField;
  /** Display values (sizes in USD million). */
  from: string | null;
  to: string | null;
}

export type RowStatus = "change" | "unchanged" | "error";

export interface ImportRow {
  line: number;
  status: RowStatus;
  projectId: string | null;
  /** "Country A: Title", for the preview. */
  projectLabel: string | null;
  errors: string[];
  changes: FieldChange[];
  /** What the server writes (stored form), only for status "change". */
  data: Partial<Record<MetadataField, string | null>>;
  /** updatedAt of the project when planned. */
  expectedUpdatedAt: string | null;
}

export interface ImportPlan {
  /** Problems with the file as a whole; when present no row is applied. */
  fileErrors: string[];
  /** Header names that are neither export columns nor accepted alternatives; ignored. */
  ignoredColumns: string[];
  rows: ImportRow[];
  summary: { rows: number; changes: number; unchanged: number; errors: number };
}

const KNOWN_COLUMNS = new Set<string>([
  ...PROJECT_EXPORT_HEADER,
  ...ID_COLUMNS,
  ...ISO3_COLUMNS,
  ...TITLE_COLUMNS,
]);

/** Display form of a stored value. */
function displayOf(field: MetadataField, stored: string | null): string | null {
  if (stored === null) return null;
  if (field === "sizeMinUsd" || field === "sizeMaxUsd") {
    return usdToMillion(stored);
  }
  return stored;
}

function sameStored(field: MetadataField, a: string | null, b: string | null) {
  if (a === null || b === null) return a === b;
  if (field === "sizeMinUsd" || field === "sizeMaxUsd") {
    return Number(a) === Number(b);
  }
  return a === b;
}

/** Case and spacing tolerant comparison of titles. */
function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

type Parsed =
  | { kind: "keep" }
  | { kind: "set"; stored: string | null }
  | { kind: "error"; message: string };

function parseText(raw: string, label: string): Parsed {
  if (raw === "") return { kind: "keep" };
  if (raw === CLEAR_MARKER) return { kind: "set", stored: null };
  const value = raw.replace(/\s+/g, " ").trim();
  if (value.length > MAX_TEXT) {
    return {
      kind: "error",
      message: `Keep the ${label} to ${MAX_TEXT} characters or fewer.`,
    };
  }
  return { kind: "set", stored: value };
}

function parseSize(raw: string, label: string): Parsed {
  if (raw === "") return { kind: "keep" };
  if (raw === CLEAR_MARKER) return { kind: "set", stored: null };
  const n = Number(raw.replace(/[,\s]/g, "").replace(/^usd/i, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_SIZE_MILLION) {
    return {
      kind: "error",
      message: `${label}: enter a number between 0 and ${MAX_SIZE_MILLION.toLocaleString("en-GB")} (USD million), not "${raw.slice(0, 40)}".`,
    };
  }
  return { kind: "set", stored: millionToUsd(n) };
}

/** Exact spelling of a suggestion when the value matches one apart from case, so filters group neatly. */
function canonical(value: string | null, suggestions: readonly string[]) {
  if (value === null) return null;
  return (
    suggestions.find((s) => s.toLowerCase() === value.toLowerCase()) ?? value
  );
}

/**
 * Works out what an import would change, row by row, without touching anything. The server runs it again on
 * apply, against fresh data, and writes only rows with status "change".
 */
export function planMetadataImport(
  table: CsvTable,
  projects: readonly ProjectSnapshot[],
): ImportPlan {
  const fileErrors: string[] = [];
  const idColumn = findColumn(table, ID_COLUMNS);
  const iso3Column = findColumn(table, ISO3_COLUMNS);
  const titleColumn = findColumn(table, TITLE_COLUMNS);
  const metadataColumns = METADATA_FIELDS.filter((f) =>
    table.header.includes(METADATA_COLUMN[f]),
  );
  if (!idColumn && !(iso3Column && titleColumn)) {
    fileErrors.push(
      "The file needs a project_id column, or iso3 and title columns, to find the projects.",
    );
  }
  if (metadataColumns.length === 0) {
    fileErrors.push(
      `The file has none of the columns ${METADATA_FIELDS.map((f) => METADATA_COLUMN[f]).join(", ")}.`,
    );
  }
  const duplicates = table.header.filter(
    (name, i) => name !== "" && table.header.indexOf(name) !== i,
  );
  if (duplicates.length > 0) {
    fileErrors.push(`Column ${duplicates[0]} appears more than once.`);
  }
  const ignoredColumns = table.header.filter(
    (name) => name !== "" && !KNOWN_COLUMNS.has(name),
  );

  const byId = new Map(projects.map((p) => [p.id, p]));
  const byKey = new Map<string, ProjectSnapshot[]>();
  for (const p of projects) {
    const key = `${p.iso3.toUpperCase()}|${titleKey(p.title)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const seen = new Map<string, number>();

  const rows: ImportRow[] = [];
  if (fileErrors.length === 0) {
    for (const row of table.rows) {
      const errors: string[] = [];
      let project: ProjectSnapshot | null = null;
      const id = idColumn ? cellOf(table, row, idColumn) : "";
      if (id) {
        project = byId.get(id) ?? null;
        if (!project)
          errors.push(`No project has the id "${id.slice(0, 40)}".`);
      } else {
        const iso3 = iso3Column ? cellOf(table, row, iso3Column) : "";
        const title = titleColumn ? cellOf(table, row, titleColumn) : "";
        if (!iso3 || !title) {
          errors.push(
            "Give the project_id, or the country ISO3 code and title.",
          );
        } else {
          const matches =
            byKey.get(`${iso3.toUpperCase()}|${titleKey(title)}`) ?? [];
          if (matches.length === 1) project = matches[0];
          else if (matches.length === 0) {
            errors.push(
              `No project of ${iso3.toUpperCase().slice(0, 3)} has the title "${title.slice(0, 80)}".`,
            );
          } else {
            errors.push(
              "More than one project has this country and title. Use the project_id instead.",
            );
          }
        }
      }
      if (project) {
        const earlier = seen.get(project.id);
        if (earlier !== undefined) {
          errors.push(`The same project is already on line ${earlier}.`);
        } else {
          seen.set(project.id, row.line);
        }
      }

      const parsed: Partial<Record<MetadataField, Parsed>> = {};
      for (const field of metadataColumns) {
        const raw = cellOf(table, row, METADATA_COLUMN[field]);
        parsed[field] =
          field === "sizeMinUsd" || field === "sizeMaxUsd"
            ? parseSize(raw, METADATA_LABEL[field])
            : parseText(raw, METADATA_LABEL[field].toLowerCase());
      }
      for (const result of Object.values(parsed)) {
        if (result?.kind === "error") errors.push(result.message);
      }

      const changes: FieldChange[] = [];
      const data: Partial<Record<MetadataField, string | null>> = {};
      if (project && errors.length === 0) {
        const merged: Record<MetadataField, string | null> = {
          region: project.region,
          pppModel: project.pppModel,
          sizeMinUsd: project.sizeMinUsd,
          sizeMaxUsd: project.sizeMaxUsd,
          developmentStage: project.developmentStage,
        };
        for (const field of metadataColumns) {
          const result = parsed[field];
          if (result?.kind !== "set") continue;
          let next = result.stored;
          if (field === "pppModel")
            next = canonical(next, PPP_MODEL_SUGGESTIONS);
          if (field === "developmentStage") {
            next = canonical(next, DEVELOPMENT_STAGE_SUGGESTIONS);
          }
          merged[field] = next;
          if (!sameStored(field, project[field], next)) {
            data[field] = next;
            changes.push({
              field,
              from: displayOf(field, project[field]),
              to: displayOf(field, next),
            });
          }
        }
        if (
          merged.sizeMinUsd !== null &&
          merged.sizeMaxUsd !== null &&
          Number(merged.sizeMaxUsd) < Number(merged.sizeMinUsd)
        ) {
          errors.push(
            `The upper size (${displayOf("sizeMaxUsd", merged.sizeMaxUsd)}) must not be below the lower size (${displayOf("sizeMinUsd", merged.sizeMinUsd)}).`,
          );
        }
      }

      const status: RowStatus =
        errors.length > 0
          ? "error"
          : changes.length > 0
            ? "change"
            : "unchanged";
      rows.push({
        line: row.line,
        status,
        projectId: project?.id ?? null,
        projectLabel: project
          ? `${project.countryName}: ${project.title}`
          : null,
        errors,
        changes: status === "change" ? changes : [],
        data: status === "change" ? data : {},
        expectedUpdatedAt: project?.updatedAt ?? null,
      });
    }
  }

  return {
    fileErrors,
    ignoredColumns,
    rows,
    summary: {
      rows: rows.length,
      changes: rows.filter((r) => r.status === "change").length,
      unchanged: rows.filter((r) => r.status === "unchanged").length,
      errors: rows.filter((r) => r.status === "error").length,
    },
  };
}
