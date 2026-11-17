"use client";

import { useActionState } from "react";
import {
  confirmEnrolmentAction,
  type EnrolmentState,
  startEnrolmentAction,
} from "@/app/(account)/actions";
import { Field, FormError, SubmitButton } from "@/components/auth/form-parts";

const initial: EnrolmentState = {};

/** Groups the secret in fours so it can be typed into an app by hand. */
function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function EnrolmentForm() {
  const [started, startAction, starting] = useActionState(
    startEnrolmentAction,
    initial,
  );
  const [confirmed, confirmAction, confirming] = useActionState(
    confirmEnrolmentAction,
    initial,
  );
  const setup = started.setup;

  if (!setup) {
    return (
      <form action={startAction} className="flex flex-col gap-4" noValidate>
        <FormError message={started.error} />
        <Field
          label="Confirm your password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          hint="We ask again before showing the secret for your authenticator app."
          error={started.fieldErrors?.password}
        />
        <SubmitButton pending={starting} pendingLabel="Preparing…">
          Continue
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex list-decimal flex-col gap-4 ps-5 text-sm">
        <li>
          Install an authenticator app on your phone, for example Microsoft
          Authenticator or Google Authenticator.
        </li>
        <li>
          Scan this QR code with the app.
          <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, not a remote image */}
            <img
              src={setup.qrDataUrl}
              alt="QR code to add this portal to your authenticator app"
              width={176}
              height={176}
              className="rounded-lg border bg-white p-2"
            />
            <div className="text-xs text-muted-foreground">
              Cannot scan? Add an account by hand with this key:
              <code
                data-testid="totp-secret"
                className="mt-1 block font-mono text-sm break-all text-foreground"
              >
                {groupSecret(setup.secret)}
              </code>
            </div>
          </div>
        </li>
        <li>
          Keep these backup codes somewhere safe, away from your phone. Each one
          lets you sign in once if you lose the phone.
          <ul
            aria-label="Backup codes"
            className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-ack-border bg-ack-surface p-3 font-mono text-sm"
          >
            {setup.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </li>
      </ol>

      <form action={confirmAction} className="flex flex-col gap-4" noValidate>
        <FormError message={confirmed.error} />
        <Field
          label="Enter the 6-digit code shown in the app"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          error={confirmed.fieldErrors?.code}
        />
        <SubmitButton pending={confirming} pendingLabel="Checking…">
          Turn on two-step verification
        </SubmitButton>
      </form>
    </div>
  );
}
