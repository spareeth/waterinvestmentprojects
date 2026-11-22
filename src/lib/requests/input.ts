// What an investor types when requesting a meeting (M5, PLAN v0.3 F5): who will attend (name and email, prefilled
// from the account), organisation, role, a short note and, when meeting times are open (F9), the time.
// Pure. No ranking and no limit on the number of requests (PLAN 0.9).

import { parseRoomSlotValue } from "@/lib/meetings/schedule";
import { z } from "zod";

export const REQUEST_LIMITS = {
  contactName: 200,
  contactEmail: 254,
  organisation: 200,
  role: 120,
  note: 1000,
} as const;

export interface RequestFormValues {
  contactName: string;
  contactEmail: string;
  organisation: string;
  role: string;
  note: string;
  /** The chosen meeting slot ("ISO|Room", or a bare ISO time), or "" when none was chosen. */
  slot: string;
}

export interface RequestInput {
  contactName: string;
  contactEmail: string;
  organisation: string;
  role: string;
  note: string;
  /** Start of the chosen meeting time; null when no time was chosen. */
  slotStartsAt?: Date | null;
  /** The chosen room (22 Nov); null lets the portal take the first free room at that time. */
  slotRoom?: string | null;
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

/** One line of text: control characters and line breaks removed, spaces collapsed. */
function line(min: number, max: number, empty: string, tooLong: string) {
  return z
    .string()
    .transform((v) => tidy(stripControl(v)).replace(/\n/g, " "))
    .pipe(z.string().min(min, empty).max(max, tooLong));
}

export const SLOT_MESSAGE = "Choose a meeting time.";

const schema = z.object({
  contactName: line(
    2,
    REQUEST_LIMITS.contactName,
    "Enter the name of the person who will attend.",
    `Keep the name to ${REQUEST_LIMITS.contactName} characters.`,
  ),
  contactEmail: z
    .string()
    .trim()
    .max(REQUEST_LIMITS.contactEmail, "Enter a valid email address.")
    .pipe(z.email("Enter a valid email address, for example name@fund.com."))
    .transform((v) => v.toLowerCase()),
  organisation: line(
    1,
    REQUEST_LIMITS.organisation,
    "Enter your organisation.",
    `Keep the organisation to ${REQUEST_LIMITS.organisation} characters.`,
  ),
  role: line(
    1,
    REQUEST_LIMITS.role,
    "Enter your role.",
    `Keep the role to ${REQUEST_LIMITS.role} characters.`,
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
  slot: z
    .string()
    .trim()
    .refine((v) => v === "" || parseRoomSlotValue(v) !== null, SLOT_MESSAGE)
    .transform((v) => (v === "" ? null : parseRoomSlotValue(v))),
});

export type ParsedRequestInput =
  | { ok: true; input: RequestInput }
  | { ok: false; fieldErrors: Record<string, string> };

/** `slotRequired`: a meeting time must be chosen (true while any time is still free). */
export function parseRequestInput(
  values: RequestFormValues,
  { slotRequired = false }: { slotRequired?: boolean } = {},
): ParsedRequestInput {
  const result = schema.safeParse(values);
  const fieldErrors: Record<string, string> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] ??= issue.message;
    }
  }
  if (slotRequired && values.slot.trim() === "") {
    fieldErrors.slot ??= SLOT_MESSAGE;
  }
  if (!result.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  const { slot, ...rest } = result.data;
  return {
    ok: true,
    input: {
      ...rest,
      slotStartsAt: slot?.startsAt ?? null,
      slotRoom: slot?.room ?? null,
    },
  };
}

export function requestValuesFrom(formData: FormData): RequestFormValues {
  const text = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  return {
    contactName: text("contactName"),
    contactEmail: text("contactEmail"),
    organisation: text("organisation"),
    role: text("role"),
    note: text("note"),
    slot: text("slot"),
  };
}
