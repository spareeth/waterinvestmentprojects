"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/auth/form-parts";
import { OrganisationType } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import {
  acceptInvitation,
  InvitationError,
  type InvitationState,
} from "@/lib/auth/invitations";
import { type RateLimitKey, takeToken } from "@/lib/auth/rate-limit";
import {
  register,
  signInWithPassword,
  verifySecondStep,
} from "@/lib/auth/service";
import { stagePathForUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

// Server actions for the signed-out screens. They run before anyone is signed in, so there is no account gate
// to pass; each one is rate limited per IP, validates its input and writes the audit trail through the service.

const TOO_MANY =
  "Too many attempts from this connection. Please wait a minute and try again.";

async function limited(key: RateLimitKey): Promise<{ h: Headers } | null> {
  const h = await headers();
  return takeToken(key, requestMetaFrom(h).ip) ? { h } : null;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

const passwordRules = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(128, "Use at most 128 characters.");

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ok = await limited("signIn");
  if (!ok) return { error: TOO_MANY };
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await signInWithPassword(parsed.data, ok.h);
  if (result.status === "failed") {
    return {
      error:
        result.reason === "locked"
          ? "This account is locked for 15 minutes after too many failed attempts."
          : "The email address or password is not correct.",
    };
  }
  if (result.status === "second-step") redirect("/sign-in/two-factor");
  redirect(await stagePathForUser(result.userId));
}

const secondStepSchema = z.object({
  code: z.string().trim().min(6, "Enter the code.").max(32),
  method: z.enum(["totp", "backup"]),
});

export async function secondStepAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ok = await limited("secondStep");
  if (!ok) return { error: TOO_MANY };
  const parsed = secondStepSchema.safeParse({
    code: formData.get("code"),
    method: formData.get("method"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await verifySecondStep(parsed.data, ok.h);
  if (result.status === "failed") {
    return {
      error:
        result.reason === "locked"
          ? "Too many wrong codes. Please wait a few minutes, then sign in again."
          : "That code did not work. Check the code, or start again from the sign-in page if more than 10 minutes have passed.",
    };
  }
  if (result.status !== "signed-in") redirect("/sign-in");
  redirect(await stagePathForUser(result.userId));
}

// ---------------------------------------------------------------------------
// Invitation
// ---------------------------------------------------------------------------

const acceptSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(120),
    organisation: z.string().trim().max(160).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    password: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });

const INVITATION_MESSAGES: Record<Exclude<InvitationState, "valid">, string> = {
  not_found: "This invitation link is not valid.",
  accepted: "This invitation has already been used. Please sign in.",
  expired:
    "This invitation has expired. Please ask the Summit team for a new one.",
  account_exists:
    "An account already exists for this email address. Please sign in.",
};

export async function acceptInvitationAction(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ok = await limited("invitation");
  if (!ok) return { error: TOO_MANY };
  const parsed = acceptSchema.safeParse({
    name: formData.get("name"),
    organisation: formData.get("organisation") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let accepted: { userId: string; email: string };
  try {
    accepted = await acceptInvitation(
      token,
      parsed.data,
      requestMetaFrom(ok.h),
    );
  } catch (error) {
    if (error instanceof InvitationError) {
      return { error: INVITATION_MESSAGES[error.state] };
    }
    throw error;
  }

  const signedIn = await signInWithPassword(
    { email: accepted.email, password: parsed.data.password },
    ok.h,
  );
  if (signedIn.status !== "signed-in") redirect("/sign-in");
  redirect(await stagePathForUser(signedIn.userId));
}

// ---------------------------------------------------------------------------
// Investor and operator registration (M13; off when SELF_REGISTRATION_ENABLED="false")
// ---------------------------------------------------------------------------

const noLineBreaks = /^[^\u0000-\u001f\u007f]+$/;

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120)
      .regex(noLineBreaks, "Enter your name without line breaks."),
    organisation: z
      .string()
      .trim()
      .min(2, "Enter your organisation.")
      .max(160)
      .regex(noLineBreaks, "Enter the organisation without line breaks."),
    organisationType: z.enum(OrganisationType, {
      error: "Choose the type of organisation.",
    }),
    jobTitle: z
      .string()
      .trim()
      .min(2, "Enter your job title.")
      .max(120)
      .regex(noLineBreaks, "Enter your job title without line breaks."),
    email: z.email("Enter a valid email address.").max(254),
    password: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!getEnv().SELF_REGISTRATION_ENABLED) notFound();
  const ok = await limited("register");
  if (!ok) return { error: TOO_MANY };
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    organisation: formData.get("organisation"),
    organisationType: formData.get("organisationType") ?? "",
    jobTitle: formData.get("jobTitle") ?? "",
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await register(parsed.data, ok.h);
  if (result.status === "failed") {
    return {
      error:
        "We could not create an account with these details. If you already have an account, please sign in.",
    };
  }
  // Waiting for approval: the pending screen. Pre-approved with immediate access: the investor acknowledgement.
  redirect(await stagePathForUser(result.userId));
}
