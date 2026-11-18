"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import {
  ACCOUNT_MESSAGES,
  AccountError,
  createAccount,
  resetTemporaryPassword,
} from "@/lib/auth/accounts";
import { requireViewer } from "@/lib/authz";

// Admin account hand-out (M2, PLAN 0a.4). Each action gets the Viewer itself and leaves the permission decision
// to the accounts service, which checks through src/lib/authz/account-policies.ts.

export interface AccountFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Shown once to the admin, who passes it on personally. Never stored or logged. */
  handOut?: { name: string; email: string; temporaryPassword: string };
}

function refused(error: unknown): AccountFormState {
  if (!(error instanceof AccountError)) throw error;
  return {
    error: Object.values(error.fieldErrors)[0] ?? ACCOUNT_MESSAGES[error.code],
    fieldErrors: error.fieldErrors,
  };
}

const createSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  name: z.string().trim().min(2, "Enter the full name.").max(120),
  organisation: z.string().trim().max(160).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  role: z.enum(UserRole, "Choose a role."),
  countryIds: z.array(z.string().min(1).max(64)).max(50),
});

export async function createAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const viewer = await requireViewer();
  const parsed = createSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    name: formData.get("name"),
    organisation: formData.get("organisation") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    role: formData.get("role"),
    countryIds: formData.getAll("countryIds").map(String),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    }
    return { error: Object.values(fieldErrors)[0], fieldErrors };
  }
  try {
    const created = await createAccount(
      viewer,
      parsed.data,
      requestMetaFrom(await headers()),
    );
    refresh();
    return {
      handOut: {
        name: parsed.data.name,
        email: created.email,
        temporaryPassword: created.temporaryPassword,
      },
    };
  } catch (error) {
    return refused(error);
  }
}

export async function resetPasswordAction(
  userId: string,
  name: string,
): Promise<AccountFormState> {
  const viewer = await requireViewer();
  try {
    const reset = await resetTemporaryPassword(
      viewer,
      userId,
      requestMetaFrom(await headers()),
    );
    refresh();
    return {
      handOut: {
        name,
        email: reset.email,
        temporaryPassword: reset.temporaryPassword,
      },
    };
  } catch (error) {
    return refused(error);
  }
}
