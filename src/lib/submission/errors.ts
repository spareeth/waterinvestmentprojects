// Why an upload link action was refused (M0). Pure, so the form and tests can use the codes and messages.
// British spelling, no em dashes.

import { formatBytes, MAX_TEASER_BYTES } from "@/lib/workspace/teaser-file";
import { MAX_SUBMISSION_BYTES, MAX_TEASERS_PER_SUBMISSION } from "./input";

export type SubmissionErrorCode =
  | "link_invalid"
  | "link_expired"
  | "rate_limited"
  | "invalid"
  | "forbidden"
  | "not_found";

export class SubmissionError extends Error {
  constructor(
    public readonly code: SubmissionErrorCode,
    /** Per-field messages when code is "invalid". */
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(`Submission refused: ${code}`);
    this.name = "SubmissionError";
  }
}

export const SUBMISSION_MESSAGES: Record<SubmissionErrorCode, string> = {
  link_invalid:
    "This upload link is not valid or has been switched off. Please contact the Summit team for a new link.",
  link_expired:
    "This upload link has expired. Please contact the Summit team for a new link.",
  rate_limited:
    "Too many attempts from your network. Please wait a few minutes and try again.",
  invalid: "Please correct the fields marked below.",
  forbidden: "You do not have permission to do this.",
  not_found: "This item could not be found.",
};

export const FIELD_MESSAGES = {
  countryId: "Choose your country.",
  acknowledge:
    "Tick the confirmation box. Teasers can only be accepted with this consent.",
  noTeasers: "Add at least one teaser.",
  tooManyTeasers: `Send at most ${MAX_TEASERS_PER_SUBMISSION} teasers at a time. Use the link again for more.`,
  sector: "Choose the sector.",
  file_missing: "Choose the teaser file.",
  file_too_large: `Each teaser must be ${formatBytes(MAX_TEASER_BYTES)} or smaller.`,
  file_not_pdf: "Upload a PDF or PowerPoint (.pptx) file.",
  file_wrong_type:
    "Upload a PDF or PowerPoint (.pptx) file. Other formats, and files whose content does not match their name, are not accepted.",
  totalTooLarge: `Together the files must be ${formatBytes(MAX_SUBMISSION_BYTES)} or smaller. Send the rest in a second submission.`,
  expiresAt: "Choose an expiry date in the future.",
} as const;
