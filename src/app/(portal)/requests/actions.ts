"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import {
  REQUEST_MESSAGES,
  RequestError,
  type RequestErrorCode,
} from "@/lib/requests/errors";
import {
  parseRequestInput,
  type RequestFormValues,
  requestValuesFrom,
} from "@/lib/requests/input";
import {
  createMeetingRequest,
  decideMeetingRequest,
  withdrawMeetingRequest,
} from "@/lib/requests/service";

// Meeting request server actions (M5). Each one gets the Viewer itself (requireViewer) and leaves every permission
// decision to the request service, which checks through src/lib/authz. Nothing here trusts the page that rendered
// the form: ids come from bound arguments, and the service refuses what the viewer may not do.

export interface RequestFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: RequestFormValues;
  success?: string;
}

function refused(error: unknown, values?: RequestFormValues): RequestFormState {
  if (!(error instanceof RequestError)) throw error;
  const code: RequestErrorCode = error.code;
  return { error: REQUEST_MESSAGES[code], values };
}

async function meta() {
  return requestMetaFrom(await headers());
}

export async function createMeetingRequestAction(
  projectId: string,
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const viewer = await requireViewer();
  const values = requestValuesFrom(formData);
  const parsed = parseRequestInput(values);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  try {
    await createMeetingRequest(viewer, projectId, parsed.input, {
      meta: await meta(),
    });
  } catch (error) {
    return refused(error, values);
  }
  refresh();
  return {
    success:
      "Your request has been sent. The country's focal point will accept or decline it.",
  };
}

/** Bound to the request id; useActionState passes the previous state, which this action does not need. */
export async function withdrawMeetingRequestAction(
  requestId: string,
): Promise<RequestFormState> {
  const viewer = await requireViewer();
  try {
    await withdrawMeetingRequest(viewer, requestId, { meta: await meta() });
  } catch (error) {
    return refused(error);
  }
  refresh();
  return { success: "Request withdrawn." };
}

export async function decideMeetingRequestAction(
  requestId: string,
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const viewer = await requireViewer();
  const outcome = formData.get("outcome");
  if (outcome !== "ACCEPTED" && outcome !== "DECLINED") {
    return { error: REQUEST_MESSAGES.invalid };
  }
  try {
    await decideMeetingRequest(viewer, requestId, outcome, {
      meta: await meta(),
    });
  } catch (error) {
    return refused(error);
  }
  refresh();
  return {
    success: outcome === "ACCEPTED" ? "Request accepted." : "Request declined.",
  };
}
