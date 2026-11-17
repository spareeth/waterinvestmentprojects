"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import type { FormState } from "@/components/auth/form-parts";
import { requestMetaFrom } from "@/lib/audit";
import { takeToken } from "@/lib/auth/rate-limit";
import {
  acceptTerms,
  confirmEnrolment,
  signOut,
  startEnrolment,
} from "@/lib/auth/service";
import { getCurrentSession, stagePathForUser } from "@/lib/auth/session";
import { requireStage } from "@/lib/authz";

// Server actions for signed-in people who have not reached the portal yet (enrolment, terms) and for sign-out.
// Each one re-checks the account gate itself rather than trusting the page that rendered the form.

const TOO_MANY = "Too many attempts. Please wait a minute and try again.";

export interface EnrolmentState extends FormState {
  setup?: {
    qrDataUrl: string;
    secret: string;
    backupCodes: string[];
  };
}

export async function startEnrolmentAction(
  _prev: EnrolmentState,
  formData: FormData,
): Promise<EnrolmentState> {
  await requireStage("enrol-2fa");
  const h = await headers();
  if (!takeToken("enrol", requestMetaFrom(h).ip)) return { error: TOO_MANY };
  const password = String(formData.get("password") ?? "");
  if (!password) return { fieldErrors: { password: "Enter your password." } };

  const result = await startEnrolment(password, h);
  if (result.status === "failed") {
    return {
      error:
        result.reason === "already_enrolled"
          ? "Two-step verification is already set up for this account."
          : "The password is not correct.",
    };
  }
  const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
  const svg = await QRCode.toString(result.totpURI, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  return {
    setup: {
      qrDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      secret,
      backupCodes: result.backupCodes,
    },
  };
}

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your app.");

export async function confirmEnrolmentAction(
  prev: EnrolmentState,
  formData: FormData,
): Promise<EnrolmentState> {
  const current = await requireStage("enrol-2fa");
  const h = await headers();
  if (!takeToken("enrol", requestMetaFrom(h).ip)) {
    return { ...prev, error: TOO_MANY };
  }
  const parsed = codeSchema.safeParse(formData.get("code"));
  if (!parsed.success) {
    return { ...prev, fieldErrors: { code: parsed.error.issues[0].message } };
  }
  const result = await confirmEnrolment(parsed.data, current.user.id, h);
  if (result.status === "failed") {
    return {
      ...prev,
      fieldErrors: undefined,
      error:
        "That code did not work. Check that the time on your phone is set automatically and try the next code.",
    };
  }
  redirect(await stagePathForUser(current.user.id));
}

export async function acceptTermsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await requireStage("terms");
  if (formData.get("accept") !== "yes") {
    return {
      fieldErrors: { accept: "Tick the box to accept the terms of use." },
    };
  }
  await acceptTerms(current.user.id, await headers());
  redirect(await stagePathForUser(current.user.id));
}

export async function signOutAction(): Promise<void> {
  const h = await headers();
  const current = await getCurrentSession(h);
  await signOut(current?.user.id ?? null, h);
  redirect("/signed-out");
}
