"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/(auth)/actions";
import {
  emptyFormState,
  Field,
  FormError,
  SubmitButton,
} from "@/components/auth/form-parts";

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, emptyFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="username"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Continue
      </SubmitButton>
    </form>
  );
}
