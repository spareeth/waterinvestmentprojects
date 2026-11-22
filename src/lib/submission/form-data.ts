// Reading the teaser upload form (M0) and shaping its result, shared by the upload link action and the
// My projects action (22 Nov). Not a server action module itself, so it may export plain functions.

import { MAX_TEASER_BYTES } from "@/lib/workspace/teaser-file";
import { formatUaeTime } from "./format";
import { MAX_TEASERS_PER_SUBMISSION, SUBMISSION_FIELDS } from "./input";
import type {
  SubmissionFile,
  SubmissionInput,
  SubmissionReceipt,
} from "./service";

export interface SubmitFormValues {
  countryId?: string;
  uploaderName?: string;
  uploaderEmail?: string;
  uploaderJobTitle?: string;
  governmentOrganisation?: string;
  sectors?: string[];
}

export interface SubmitFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What the person typed, so a refused form keeps it (files have to be chosen again). */
  values?: SubmitFormValues;
  /** Shown as the confirmation page (also emailed when email is set up). */
  receipt?: {
    submissionId: string;
    countryName: string;
    uploaderName: string;
    uploaderEmail: string;
    uploaderJobTitle: string;
    governmentOrganisation: string;
    /** When the acknowledgement was given, already formatted in UAE time. */
    acceptedAt: string;
    files: { filename: string; sector: string }[];
    /** True when a confirmation email really went out. */
    emailSent: boolean;
  };
}

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

async function fileFrom(
  value: FormDataEntryValue | null,
): Promise<SubmissionFile | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  // Too large: do not read it; the service reports it from the size alone.
  if (value.size > MAX_TEASER_BYTES) {
    return { name: value.name, bytes: new Uint8Array(MAX_TEASER_BYTES + 1) };
  }
  return { name: value.name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

/** The service input and the typed values (to keep in a refused form). */
export async function readSubmissionForm(
  formData: FormData,
): Promise<{ input: SubmissionInput; values: SubmitFormValues }> {
  const teasers: { sector: string; file: SubmissionFile | null }[] = [];
  // Rows are numbered from 0 by the form; one past the limit is read so "too many" can be reported.
  for (let i = 0; i <= MAX_TEASERS_PER_SUBMISSION; i++) {
    const sector = formData.get(SUBMISSION_FIELDS.sector(i));
    const file = formData.get(SUBMISSION_FIELDS.teaser(i));
    if (sector === null && file === null) break;
    teasers.push({
      sector: typeof sector === "string" ? sector : "",
      file: await fileFrom(file),
    });
  }
  const values: SubmitFormValues = {
    countryId: text(formData, SUBMISSION_FIELDS.countryId),
    uploaderName: text(formData, SUBMISSION_FIELDS.uploaderName),
    uploaderEmail: text(formData, SUBMISSION_FIELDS.uploaderEmail),
    uploaderJobTitle: text(formData, SUBMISSION_FIELDS.uploaderJobTitle),
    governmentOrganisation: text(
      formData,
      SUBMISSION_FIELDS.governmentOrganisation,
    ),
    sectors: teasers.map((t) => t.sector),
  };
  return {
    values,
    input: {
      countryId: values.countryId,
      uploaderName: values.uploaderName ?? "",
      uploaderEmail: values.uploaderEmail ?? "",
      uploaderJobTitle: values.uploaderJobTitle ?? "",
      governmentOrganisation: values.governmentOrganisation ?? "",
      acknowledged: text(formData, SUBMISSION_FIELDS.acknowledge) === "yes",
      teasers,
    },
  };
}

export function receiptState(
  receipt: SubmissionReceipt,
): NonNullable<SubmitFormState["receipt"]> {
  return {
    submissionId: receipt.submissionId,
    countryName: receipt.countryName,
    uploaderName: receipt.uploaderName,
    uploaderEmail: receipt.uploaderEmail,
    uploaderJobTitle: receipt.uploaderJobTitle,
    governmentOrganisation: receipt.governmentOrganisation,
    acceptedAt: formatUaeTime(receipt.acceptedAt),
    files: receipt.files,
    emailSent: receipt.emailSent,
  };
}
