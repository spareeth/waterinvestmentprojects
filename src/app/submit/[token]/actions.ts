"use server";

import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { takeToken } from "@/lib/auth/rate-limit";
import { SUBMISSION_MESSAGES, SubmissionError } from "@/lib/submission/errors";
import {
  readSubmissionForm,
  receiptState,
  type SubmitFormState,
} from "@/lib/submission/form-data";
import { submitTeasers } from "@/lib/submission/service";

// Upload link server action (M0). No account: the token (bound by the page) is the only authorisation, and the
// submission service resolves it through the policy module. The country never comes from this form on a
// country link.

export async function submitTeasersAction(
  token: string,
  _prev: SubmitFormState,
  formData: FormData,
): Promise<SubmitFormState> {
  const meta = requestMetaFrom(await headers());
  const { input, values } = await readSubmissionForm(formData);
  if (!takeToken("uploadSubmit", meta.ip)) {
    return { error: SUBMISSION_MESSAGES.rate_limited, values };
  }
  try {
    const receipt = await submitTeasers(token, input, { meta });
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
