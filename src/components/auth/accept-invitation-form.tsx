"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/app/(auth)/actions";
import {
  emptyFormState,
  Field,
  FormError,
  SubmitButton,
} from "@/components/auth/form-parts";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";

export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(
    acceptInvitationAction.bind(null, token),
    emptyFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        readOnly
        hint="Invitations are personal, so the address cannot be changed."
      />
      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />
      <Field
        label="Organisation"
        name="organisation"
        autoComplete="organization"
        error={state.fieldErrors?.organisation}
      />
      <Field
        label="Job title"
        name="jobTitle"
        autoComplete="organization-title"
        error={state.fieldErrors?.jobTitle}
      />
      <Field
        label="Choose a password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A passphrase of several words works well.`}
        error={state.fieldErrors?.password}
      />
      <Field
        label="Repeat the password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending} pendingLabel="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  );
}
