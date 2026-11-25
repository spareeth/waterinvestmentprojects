"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import {
  saveSignup,
  SIGNUP_MESSAGES,
  SignupError,
  withdrawSignup,
} from "@/lib/meetings/signups";

// Meeting sign-up server actions (25 Nov). Each one gets the Viewer itself and leaves every permission decision to
// the sign-up service (src/lib/authz/signups.ts). The project id is bound; the country comes from the project.

export interface SignupFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

async function meta() {
  return requestMetaFrom(await headers());
}

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function all(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((v): v is string => typeof v === "string")
    .slice(0, 200);
}

function refused(error: unknown): SignupFormState {
  if (!(error instanceof SignupError)) throw error;
  return {
    error:
      error.code === "invalid"
        ? (Object.values(error.fieldErrors)[0] ?? SIGNUP_MESSAGES.invalid)
        : SIGNUP_MESSAGES[error.code],
    fieldErrors: error.fieldErrors,
  };
}

export async function saveSignupAction(
  projectId: string,
  formData: FormData,
): Promise<SignupFormState> {
  const viewer = await requireViewer();
  try {
    const { created } = await saveSignup(
      viewer,
      projectId,
      {
        contactName: text(formData, "contactName"),
        contactEmail: text(formData, "contactEmail"),
        organisation: text(formData, "organisation"),
        role: text(formData, "role"),
        note: text(formData, "note"),
        slotStarts: all(formData, "slot"),
        projectIds: all(formData, "project"),
      },
      { meta: await meta() },
    );
    refresh();
    return {
      success: created
        ? "Thank you, your sign-up is saved. You can change it until sign-ups close."
        : "Your sign-up is updated.",
    };
  } catch (error) {
    return refused(error);
  }
}

export async function withdrawSignupAction(
  signupId: string,
): Promise<SignupFormState> {
  const viewer = await requireViewer();
  try {
    await withdrawSignup(viewer, signupId, { meta: await meta() });
  } catch (error) {
    return refused(error);
  }
  refresh();
  return { success: "Your sign-up is withdrawn." };
}
