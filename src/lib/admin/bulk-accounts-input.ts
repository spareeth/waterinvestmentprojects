// Bulk account hand-out from a CSV (M7, PLAN v0.3 0a.4 and 0.19). Pure and browser-safe: checks every row before
// anything is created; the server then creates each valid row through M2's createAccount (src/lib/admin/accounts.ts).
//
// Columns: email, name, organisation, job_title, role, countries. Role as on screen ("Investor or operator") or as
// its code (INVESTOR). Countries as ISO3 codes separated by ";" (or "," or spaces), only for country focal points
// and WBG coordinators.

import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { cellOf, type CsvTable } from "./csv-parse";

export const BULK_ACCOUNTS_MAX_ROWS = 300;

export const BULK_ACCOUNT_HEADER = [
  "email",
  "name",
  "organisation",
  "job_title",
  "role",
  "countries",
] as const;

const COUNTRY_LINKED: readonly UserRole[] = [
  UserRole.COUNTRY,
  UserRole.WBG_COORDINATOR,
];

/** Extra spellings people are likely to type. */
const ROLE_ALIASES: Record<string, UserRole> = {
  investor: UserRole.INVESTOR,
  operator: UserRole.INVESTOR,
  country: UserRole.COUNTRY,
  "focal point": UserRole.COUNTRY,
  "country focal point": UserRole.COUNTRY,
  "wbg coordinator": UserRole.WBG_COORDINATOR,
  coordinator: UserRole.WBG_COORDINATOR,
  "summit admin": UserRole.SUMMIT_ADMIN,
  "summit team": UserRole.SUMMIT_ADMIN,
  "platform admin": UserRole.PLATFORM_ADMIN,
  "platform administrator": UserRole.PLATFORM_ADMIN,
};

export function parseRole(raw: string): UserRole | null {
  const value = raw.trim();
  if ((Object.values(UserRole) as string[]).includes(value.toUpperCase())) {
    return value.toUpperCase() as UserRole;
  }
  const key = value.toLowerCase().replace(/[_\s]+/g, " ");
  for (const [role, label] of Object.entries(ROLE_LABEL)) {
    if (label.toLowerCase() === key) return role as UserRole;
  }
  return ROLE_ALIASES[key] ?? null;
}

export interface BulkAccountContext {
  countries: readonly { id: string; iso3: string }[];
  /** Roles this admin may hand out (assignableRoles). */
  assignableRoles: readonly UserRole[];
  /** Lower-case emails that already have an account. */
  existingEmails: ReadonlySet<string>;
}

export interface BulkAccountRow {
  line: number;
  email: string;
  name: string;
  organisation: string | null;
  jobTitle: string | null;
  role: UserRole | null;
  countryIds: string[];
  /** ISO3 codes as typed, upper case, for the preview. */
  countryCodes: string[];
  errors: string[];
}

export interface BulkAccountPlan {
  fileErrors: string[];
  rows: BulkAccountRow[];
  summary: { rows: number; ready: number; errors: number };
}

const emailSchema = z.email().max(254);

export function planBulkAccounts(
  table: CsvTable,
  context: BulkAccountContext,
): BulkAccountPlan {
  const fileErrors: string[] = [];
  for (const column of ["email", "name", "role"]) {
    if (!table.header.includes(column)) {
      fileErrors.push(`The file needs a column called ${column}.`);
    }
  }
  const byIso3 = new Map(
    context.countries.map((c) => [c.iso3.toUpperCase(), c.id]),
  );
  const seen = new Map<string, number>();
  const rows: BulkAccountRow[] = [];
  if (fileErrors.length === 0) {
    for (const row of table.rows) {
      const errors: string[] = [];
      const email = cellOf(table, row, "email").toLowerCase();
      const name = cellOf(table, row, "name").replace(/\s+/g, " ");
      const organisation = cellOf(table, row, "organisation") || null;
      const jobTitle = cellOf(table, row, "job_title") || null;
      const roleRaw = cellOf(table, row, "role");
      const role = roleRaw ? parseRole(roleRaw) : null;
      const countryCodes = cellOf(table, row, "countries")
        .split(/[;,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);

      if (!emailSchema.safeParse(email).success) {
        errors.push("Enter a valid email address.");
      } else if (context.existingEmails.has(email)) {
        errors.push("An account already exists for this email address.");
      } else if (seen.has(email)) {
        errors.push(
          `The same email address is already on line ${seen.get(email)}.`,
        );
      } else {
        seen.set(email, row.line);
      }
      if (name.length < 2 || name.length > 120) {
        errors.push("Enter the full name (2 to 120 characters).");
      }
      if (organisation && organisation.length > 160) {
        errors.push("Keep the organisation to 160 characters or fewer.");
      }
      if (jobTitle && jobTitle.length > 120) {
        errors.push("Keep the job title to 120 characters or fewer.");
      }
      if (!role) {
        errors.push(
          roleRaw
            ? `Unknown role "${roleRaw.slice(0, 40)}".`
            : "Give the role.",
        );
      } else if (!context.assignableRoles.includes(role)) {
        errors.push(`You cannot hand out the role ${ROLE_LABEL[role]}.`);
      }

      const countryIds: string[] = [];
      for (const code of new Set(countryCodes)) {
        const id = byIso3.get(code);
        if (id) countryIds.push(id);
        else errors.push(`Unknown country code "${code.slice(0, 10)}".`);
      }
      if (role && COUNTRY_LINKED.includes(role) && countryCodes.length === 0) {
        errors.push("Give at least one country (ISO3 code) for this role.");
      }
      if (role && !COUNTRY_LINKED.includes(role) && countryCodes.length > 0) {
        errors.push(
          "Only country focal points and coordinators are linked to countries.",
        );
      }

      rows.push({
        line: row.line,
        email,
        name,
        organisation,
        jobTitle,
        role,
        countryIds,
        countryCodes,
        errors,
      });
    }
  }
  const ready = rows.filter((r) => r.errors.length === 0).length;
  return {
    fileErrors,
    rows,
    summary: { rows: rows.length, ready, errors: rows.length - ready },
  };
}
