// What an investor types when requesting a meeting (M5, PLAN v0.3 F5): organisation, role and a short note.
// Pure. No ranking and no limit on the number of requests (PLAN 0.9).

import { z } from "zod";

export const REQUEST_LIMITS = {
  organisation: 200,
  role: 120,
  note: 1000,
} as const;

export interface RequestFormValues {
  organisation: string;
  role: string;
  note: string;
}

export interface RequestInput {
  organisation: string;
  role: string;
  note: string;
}

/** Collapses runs of spaces and tabs (not line breaks, which the note may use) and trims. */
function tidy(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

/** Strips control characters except line breaks and tabs from a note. */
function stripControl(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

const schema = z.object({
  organisation: z
    .string()
    .transform((v) => tidy(stripControl(v)).replace(/\n/g, " "))
    .pipe(
      z
        .string()
        .min(1, "Enter your organisation.")
        .max(
          REQUEST_LIMITS.organisation,
          `Keep the organisation to ${REQUEST_LIMITS.organisation} characters.`,
        ),
    ),
  role: z
    .string()
    .transform((v) => tidy(stripControl(v)).replace(/\n/g, " "))
    .pipe(
      z
        .string()
        .min(1, "Enter your role.")
        .max(
          REQUEST_LIMITS.role,
          `Keep the role to ${REQUEST_LIMITS.role} characters.`,
        ),
    ),
  note: z
    .string()
    .transform((v) => tidy(stripControl(v)))
    .pipe(
      z
        .string()
        .max(
          REQUEST_LIMITS.note,
          `Keep the note to ${REQUEST_LIMITS.note} characters.`,
        ),
    ),
});

export type ParsedRequestInput =
  | { ok: true; input: RequestInput }
  | { ok: false; fieldErrors: Record<string, string> };

export function parseRequestInput(
  values: RequestFormValues,
): ParsedRequestInput {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, input: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= issue.message;
  }
  return { ok: false, fieldErrors };
}

export function requestValuesFrom(formData: FormData): RequestFormValues {
  const text = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  return {
    organisation: text("organisation"),
    role: text("role"),
    note: text("note"),
  };
}
