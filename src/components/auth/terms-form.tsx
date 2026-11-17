"use client";

import { useActionState } from "react";
import { acceptTermsAction } from "@/app/(account)/actions";
import {
  emptyFormState,
  FormError,
  SubmitButton,
} from "@/components/auth/form-parts";

export function TermsForm() {
  const [state, action, pending] = useActionState(
    acceptTermsAction,
    emptyFormState,
  );
  const error = state.fieldErrors?.accept;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <label className="flex items-start gap-3 rounded-lg border border-ack-border bg-ack-surface p-4 text-sm">
        <input
          type="checkbox"
          name="accept"
          value="yes"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "accept-error" : undefined}
          className="mt-0.5 size-4 accent-brand-teal"
        />
        <span>I have read and accept these terms of use.</span>
      </label>
      {error ? (
        <p id="accept-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Accept and continue
      </SubmitButton>
    </form>
  );
}
