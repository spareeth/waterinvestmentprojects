"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/(account)/actions";
import {
  emptyFormState,
  Field,
  FormError,
  SubmitButton,
} from "@/components/auth/form-parts";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    emptyFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {/* Lets password managers save the new password against the right account. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A passphrase of several words works well.`}
        error={state.fieldErrors?.password}
      />
      <Field
        label="Repeat the new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save password and continue
      </SubmitButton>
    </form>
  );
}
