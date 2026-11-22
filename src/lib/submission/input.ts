// Upload link form rules (M0, PLAN v0.3 F0; M11, PLAN v0.4 0b.2). Pure and browser-safe, so the form and the
// server share them. Governments give only: country (fixed by the link, or chosen on the generic link), their full
// name, email and job title, the government organisation they represent, and per teaser a sector and a file.
// British spelling, no em dashes.

import { z } from "zod";
import { SECTOR_SUGGESTIONS } from "@/lib/workspace/project-input";
import { typeFromExtension } from "@/lib/workspace/teaser-file";

/** Sector drop-down: the WBG list (PLAN v0.4 0b.8), which ends in "Other" so nobody is stuck. */
export const SUBMISSION_SECTORS = SECTOR_SUGGESTIONS;

/** PLAN v0.4 0b.2 asks for no practical limit on the number of teasers; 20 per upload, then use the link again. */
export const MAX_TEASERS_PER_SUBMISSION = 20;
/** All files of one submission together (each file is also limited to 25 MB). */
export const MAX_SUBMISSION_BYTES = 60 * 1024 * 1024;

/** Form field names. Teasers use `sector-<n>` and `teaser-<n>`, n from 0. */
export const SUBMISSION_FIELDS = {
  countryId: "countryId",
  uploaderName: "uploaderName",
  uploaderEmail: "uploaderEmail",
  uploaderJobTitle: "uploaderJobTitle",
  governmentOrganisation: "governmentOrganisation",
  acknowledge: "acknowledge",
  sector: (i: number) => `sector-${i}`,
  teaser: (i: number) => `teaser-${i}`,
} as const;

/** PLAN v0.3 section 3: links expire, for example on 30 Nov (the upload window is 18 to 23 Nov). */
export const DEFAULT_LINK_EXPIRY_DATE = "2026-11-30";

/** A date from the admin form (YYYY-MM-DD) as the end of that day in UAE time; an invalid Date otherwise. */
export function linkExpiryFromDate(date: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T23:59:59+04:00`)
    : new Date(Number.NaN);
}

/** The default for the expiry field: 30 Nov, or a week from today once that has passed. */
export function defaultLinkExpiryDate(now: Date): string {
  if (linkExpiryFromDate(DEFAULT_LINK_EXPIRY_DATE).getTime() > now.getTime()) {
    return DEFAULT_LINK_EXPIRY_DATE;
  }
  const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return inAWeek.toISOString().slice(0, 10);
}

export function isSubmissionSector(value: string): boolean {
  return (SUBMISSION_SECTORS as readonly string[]).includes(value);
}

const uploaderSchema = z.object({
  uploaderName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(200, "Keep your name to 200 characters or fewer.")
    // No line breaks or control characters: the name goes into email text and the audit log.
    .regex(/^[^\u0000-\u001f\u007f]+$/, "Enter your name without line breaks."),
  uploaderEmail: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .pipe(
      z.email("Enter a valid email address, for example name@ministry.gov."),
    ),
  uploaderJobTitle: z
    .string()
    .trim()
    .min(2, "Enter your job title.")
    .max(120, "Keep your job title to 120 characters or fewer.")
    .regex(
      /^[^\u0000-\u001f\u007f]+$/,
      "Enter your job title without line breaks.",
    ),
});

export const GOVERNMENT_ORGANISATION_MAX = 200;

const organisationSchema = z
  .string()
  .trim()
  .min(2, "Enter the government organisation you represent.")
  .max(
    GOVERNMENT_ORGANISATION_MAX,
    `Keep the organisation to ${GOVERNMENT_ORGANISATION_MAX} characters or fewer.`,
  )
  .regex(
    /^[^\u0000-\u001f\u007f]+$/,
    "Enter the organisation without line breaks.",
  );

export type UploaderFields = z.infer<typeof uploaderSchema>;

/** The "Represented government organisation" answer, spaces collapsed. */
export function parseGovernmentOrganisation(
  value: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const result = organisationSchema.safeParse(value);
  return result.success
    ? { ok: true, value: result.data.replace(/\s+/g, " ") }
    : { ok: false, error: result.error.issues[0]?.message ?? "Invalid." };
}

export type UploaderParseResult =
  | { ok: true; data: UploaderFields }
  | { ok: false; fieldErrors: Record<string, string> };

export function parseUploader(values: {
  uploaderName: string;
  uploaderEmail: string;
  uploaderJobTitle: string;
}): UploaderParseResult {
  const result = uploaderSchema.safeParse(values);
  if (result.success) {
    return {
      ok: true,
      data: {
        uploaderName: result.data.uploaderName.replace(/\s+/g, " "),
        uploaderEmail: result.data.uploaderEmail.toLowerCase(),
        uploaderJobTitle: result.data.uploaderJobTitle.replace(/\s+/g, " "),
      },
    };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors };
}

/**
 * A working project name from the teaser's file name ("Lake_Basin-PPP teaser.pdf" becomes
 * "Lake Basin PPP teaser"). The Summit team edits it later; governments are not asked for a title.
 */
export function projectNameFromFilename(filename: string): string {
  const stem = (
    typeFromExtension(filename)
      ? filename.replace(/\.[A-Za-z0-9]+$/, "")
      : filename
  )
    .replace(/[_\s]+/g, " ")
    .replace(/\s-\s|(?<=\S)-(?=\S)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .trim();
  return stem.length >= 3 ? stem : "Project teaser";
}
