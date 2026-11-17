"use client";

import { useActionState, useState } from "react";
import { secondStepAction } from "@/app/(auth)/actions";
import {
  emptyFormState,
  Field,
  FormError,
  SubmitButton,
} from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";

export function SecondStepForm() {
  const [state, action, pending] = useActionState(
    secondStepAction,
    emptyFormState,
  );
  const [method, setMethod] = useState<"totp" | "backup">("totp");
  const totp = method === "totp";
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="method" value={method} />
      <Field
        key={method}
        label={totp ? "Code from your authenticator app" : "Backup code"}
        name="code"
        inputMode={totp ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoFocus
        required
        hint={
          totp
            ? "Open the authenticator app on your phone and enter the 6-digit code for this portal."
            : "Each backup code works once."
        }
        error={state.fieldErrors?.code}
      />
      <SubmitButton pending={pending} pendingLabel="Checking…">
        Verify and sign in
      </SubmitButton>
      <Button
        type="button"
        variant="link"
        className="self-start px-0"
        onClick={() => setMethod(totp ? "backup" : "totp")}
      >
        {totp ? "Use a backup code instead" : "Use the authenticator app"}
      </Button>
    </form>
  );
}
