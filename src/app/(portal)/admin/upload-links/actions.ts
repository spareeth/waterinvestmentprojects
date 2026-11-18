"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import { formatUaeTime } from "@/lib/submission/format";
import { SUBMISSION_MESSAGES, SubmissionError } from "@/lib/submission/errors";
import { linkExpiryFromDate } from "@/lib/submission/input";
import { createUploadLink, revokeUploadLink } from "@/lib/submission/service";

// Upload link admin actions (M0). Each one gets the Viewer itself and leaves the permission decision to the
// submission service, which checks through src/lib/authz.

export interface LinkFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** The new link. The URL is shown once: only its hash is stored. */
  created?: { url: string; expiresAt: string };
}

function refused(error: unknown): LinkFormState {
  if (!(error instanceof SubmissionError)) throw error;
  return {
    error:
      error.code === "invalid"
        ? (Object.values(error.fieldErrors)[0] ?? SUBMISSION_MESSAGES.invalid)
        : SUBMISSION_MESSAGES[error.code],
    fieldErrors: error.fieldErrors,
  };
}

async function meta() {
  return requestMetaFrom(await headers());
}

export async function createUploadLinkAction(
  countryId: string | null,
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const viewer = await requireViewer();
  const date = formData.get("expiresOn");
  try {
    const link = await createUploadLink(
      viewer,
      {
        countryId,
        expiresAt: linkExpiryFromDate(typeof date === "string" ? date : ""),
      },
      { meta: await meta() },
    );
    refresh();
    return {
      created: { url: link.url, expiresAt: formatUaeTime(link.expiresAt) },
    };
  } catch (error) {
    return refused(error);
  }
}

export async function revokeUploadLinkAction(
  linkId: string,
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const viewer = await requireViewer();
  if (formData.get("confirm") !== "yes") {
    return { error: "Tick the box to confirm. The link will stop working." };
  }
  try {
    await revokeUploadLink(viewer, linkId, { meta: await meta() });
  } catch (error) {
    return refused(error);
  }
  refresh();
  return { success: "Link revoked." };
}
