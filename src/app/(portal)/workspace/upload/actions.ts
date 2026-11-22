"use server";

import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { takeToken } from "@/lib/auth/rate-limit";
import { requireViewer } from "@/lib/authz";
import { SUBMISSION_MESSAGES, SubmissionError } from "@/lib/submission/errors";
import {
  readSubmissionForm,
  receiptState,
  type SubmitFormState,
} from "@/lib/submission/form-data";
import { submitWorkspaceTeasers } from "@/lib/submission/service";

// My projects, "Add project" (22 Nov): the upload link form for a signed-in country focal point. The account
// is the authorisation; the service checks it through the policy module (own ACTIVE countries only).

export async function submitWorkspaceTeasersAction(
  _prev: SubmitFormState,
  formData: FormData,
): Promise<SubmitFormState> {
  const viewer = await requireViewer();
  const meta = requestMetaFrom(await headers());
  const { input, values } = await readSubmissionForm(formData);
  if (!takeToken("uploadSubmit", meta.ip)) {
    return { error: SUBMISSION_MESSAGES.rate_limited, values };
  }
  try {
    const receipt = await submitWorkspaceTeasers(viewer, input, { meta });
    return { receipt: receiptState(receipt) };
  } catch (error) {
    if (!(error instanceof SubmissionError)) throw error;
    return {
      error: SUBMISSION_MESSAGES[error.code],
      fieldErrors: error.fieldErrors,
      values,
    };
  }
}
