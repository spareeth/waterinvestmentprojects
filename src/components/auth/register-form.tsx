"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/(auth)/actions";
import {
  emptyFormState,
  Field,
  FormError,
  SelectField,
  SubmitButton,
} from "@/components/auth/form-parts";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import {
  ORGANISATION_TYPE_LABEL,
  ORGANISATION_TYPES,
} from "@/lib/auth/pre-approval";

/** Investor and operator registration (M13, PLAN v0.4 0b.17): all fields required. */
export function RegisterForm() {
  const [state, action, pending] = useActionState(
    registerAction,
    emptyFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />
      <Field
        label="Work email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="Use your work address: it is how the Summit team recognises your organisation."
        error={state.fieldErrors?.email}
      />
      <Field
        label="Organisation"
        name="organisation"
        autoComplete="organization"
        required
        error={state.fieldErrors?.organisation}
      />
      <SelectField
        label="Organisation type"
        name="organisationType"
        placeholder="Choose the type of organisation"
        required
        options={ORGANISATION_TYPES.map((t) => ({
          value: t,
          label: ORGANISATION_TYPE_LABEL[t],
        }))}
        error={state.fieldErrors?.organisationType}
      />
      <Field
        label="Job title"
        name="jobTitle"
        autoComplete="organization-title"
        required
        error={state.fieldErrors?.jobTitle}
      />
      <Field
        label="Choose a password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
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
      <SubmitButton pending={pending} pendingLabel="Registering…">
        Register
      </SubmitButton>
    </form>
  );
}
