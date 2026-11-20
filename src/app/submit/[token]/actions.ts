"use server";

import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { takeToken } from "@/lib/auth/rate-limit";
import { SUBMISSION_MESSAGES, SubmissionError } from "@/lib/submission/errors";
import { formatUaeTime } from "@/lib/submission/format";
import {
  MAX_TEASERS_PER_SUBMISSION,
  SUBMISSION_FIELDS,
} from "@/lib/submission/input";
import { type SubmissionFile, submitTeasers } from "@/lib/submission/service";
import { MAX_TEASER_BYTES } from "@/lib/workspace/teaser-file";

// Upload link server action (M0). No account: the token (bound by the page) is the only authorisation, and the
// submission service resolves it through the policy module. The country never comes from this form on a
// country link.

export interface SubmitFormValues {
  countryId?: string;
  uploaderName?: string;
  uploaderEmail?: string;
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

export async function submitTeasersAction(
  token: string,
  _prev: SubmitFormState,
  formData: FormData,
): Promise<SubmitFormState> {
  const meta = requestMetaFrom(await headers());
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
    governmentOrganisation: text(
      formData,
      SUBMISSION_FIELDS.governmentOrganisation,
    ),
    sectors: teasers.map((t) => t.sector),
  };
  if (!takeToken("uploadSubmit", meta.ip)) {
    return { error: SUBMISSION_MESSAGES.rate_limited, values };
  }
  try {
    const receipt = await submitTeasers(
      token,
      {
        countryId: values.countryId,
        uploaderName: values.uploaderName ?? "",
        uploaderEmail: values.uploaderEmail ?? "",
        governmentOrganisation: values.governmentOrganisation ?? "",
        acknowledged: text(formData, SUBMISSION_FIELDS.acknowledge) === "yes",
        teasers,
      },
      { meta },
    );
    return {
      receipt: {
        submissionId: receipt.submissionId,
        countryName: receipt.countryName,
        uploaderName: receipt.uploaderName,
        uploaderEmail: receipt.uploaderEmail,
        governmentOrganisation: receipt.governmentOrganisation,
        acceptedAt: formatUaeTime(receipt.acceptedAt),
        files: receipt.files,
        emailSent: receipt.emailSent,
      },
    };
  } catch (error) {
    if (!(error instanceof SubmissionError)) throw error;
    return {
      error: SUBMISSION_MESSAGES[error.code],
      fieldErrors: error.fieldErrors,
      values,
    };
  }
}
