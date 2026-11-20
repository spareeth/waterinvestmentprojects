// Country contacts entered by admins (M7, PLAN v0.3 0.10 and F7): the focal point list and the WBG coordinator
// mapping that WBG sends by email. Pure and browser-safe.
//
// A contact is who receives a country's notifications; it gives no access by itself. Access comes from an account
// (country focal point or WBG coordinator with that country), which is linked to the contact by the same email.

import { z } from "zod";
import { CountryContactRole } from "@/generated/prisma/enums";
import { cellOf, type CsvTable } from "./csv-parse";

export const CONTACTS_MAX_ROWS = 1_000;

export const CONTACT_ROLE_LABEL: Record<CountryContactRole, string> = {
  FOCAL_POINT: "Focal point",
  WBG_COORDINATOR: "Coordinator",
};

export const CONTACT_HEADER = ["iso3", "name", "email", "role"] as const;

export function parseContactRole(raw: string): CountryContactRole | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");
  if (["focal point", "focal", "country focal point", "fp"].includes(key)) {
    return CountryContactRole.FOCAL_POINT;
  }
  if (["wbg coordinator", "coordinator", "wbg"].includes(key)) {
    return CountryContactRole.WBG_COORDINATOR;
  }
  return null;
}

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the full name.")
    .max(120, "Keep the name to 120 characters or fewer."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.").max(254)),
  role: z.enum(CountryContactRole, "Choose a role."),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const countrySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the country name.")
    .max(100, "Keep the name to 100 characters or fewer."),
  iso3: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Enter the three-letter ISO code, for example KEN."),
});

export type CountryInput = z.infer<typeof countrySchema>;

export interface ContactRow {
  line: number;
  countryId: string | null;
  iso3: string;
  name: string;
  email: string;
  role: CountryContactRole | null;
  errors: string[];
  /** True when the same country, email and role is already stored (the row is then skipped). */
  exists: boolean;
}

export interface ContactPlan {
  fileErrors: string[];
  rows: ContactRow[];
  summary: { rows: number; ready: number; existing: number; errors: number };
}

/** What the preview action returns to the browser. */
export type ContactsPreviewState =
  | { ok: true; preview: { plan: ContactPlan; digest: string } }
  | { ok: false; error: string };

/** Checks a contacts CSV. `existing` holds "countryId|email|role" keys already stored. */
export function planContactsImport(
  table: CsvTable,
  countries: readonly { id: string; iso3: string }[],
  existing: ReadonlySet<string>,
): ContactPlan {
  const fileErrors: string[] = [];
  for (const column of CONTACT_HEADER) {
    if (!table.header.includes(column)) {
      fileErrors.push(`The file needs a column called ${column}.`);
    }
  }
  const byIso3 = new Map(countries.map((c) => [c.iso3.toUpperCase(), c.id]));
  const seen = new Set<string>();
  const rows: ContactRow[] = [];
  if (fileErrors.length === 0) {
    for (const row of table.rows) {
      const errors: string[] = [];
      const iso3 = cellOf(table, row, "iso3").toUpperCase();
      const countryId = byIso3.get(iso3) ?? null;
      if (!countryId)
        errors.push(`Unknown country code "${iso3.slice(0, 10)}".`);
      const roleRaw = cellOf(table, row, "role");
      const parsed = contactSchema.safeParse({
        name: cellOf(table, row, "name"),
        email: cellOf(table, row, "email"),
        role: parseContactRole(roleRaw) ?? "",
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(
            issue.path[0] === "role"
              ? `Unknown role "${roleRaw.slice(0, 40)}". Use focal point or coordinator.`
              : issue.message,
          );
        }
      }
      const email = cellOf(table, row, "email").toLowerCase();
      const role = parseContactRole(roleRaw);
      const key = `${countryId}|${email}|${role}`;
      let exists = false;
      if (errors.length === 0) {
        if (seen.has(key))
          errors.push("The same contact is already in the file.");
        else if (existing.has(key)) exists = true;
        seen.add(key);
      }
      rows.push({
        line: row.line,
        countryId,
        iso3,
        name: parsed.success ? parsed.data.name : cellOf(table, row, "name"),
        email,
        role,
        errors,
        exists,
      });
    }
  }
  const errors = rows.filter((r) => r.errors.length > 0).length;
  const existingCount = rows.filter((r) => r.exists).length;
  return {
    fileErrors,
    rows,
    summary: {
      rows: rows.length,
      ready: rows.length - errors - existingCount,
      existing: existingCount,
      errors,
    },
  };
}
