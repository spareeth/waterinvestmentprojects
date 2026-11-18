"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  type AccountFormState,
  createAccountAction,
  resetPasswordAction,
} from "@/app/(portal)/admin/accounts/actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "@/components/workspace/form-controls";
import type { UserRole } from "@/generated/prisma/enums";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/role-labels";

// Like the upload link forms, these call their server actions from a submit handler (not useActionState), so a
// temporary password shown once cannot vanish when React rebuilds the page.

const COUNTRY_ROLES: readonly string[] = ["COUNTRY", "WBG_COORDINATOR"];

function HandOut({ handOut }: { handOut: AccountFormState["handOut"] }) {
  const [copied, setCopied] = useState(false);
  if (!handOut) return null;
  const text = `Email: ${handOut.email}\nTemporary password: ${handOut.temporaryPassword}`;
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-ack-border bg-ack-surface p-3 text-sm"
    >
      <p className="font-semibold">
        Temporary password for {handOut.name}. Copy it now: it is shown only
        once.
      </p>
      <p className="text-muted-foreground">
        Pass the email address and this password on personally (not in the same
        message as a link to the portal). The password must be changed at the
        first sign-in.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="break-all">{handOut.email}</dd>
        <dt className="text-muted-foreground">Password</dt>
        <dd className="font-mono">{handOut.temporaryPassword}</dd>
      </dl>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy email and password"}
        </Button>
      </div>
    </div>
  );
}

export function CreateAccountForm({
  roles,
  countries,
}: {
  roles: UserRole[];
  countries: { id: string; name: string }[];
}) {
  const [state, setState] = useState<AccountFormState>({});
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<string>("");
  const needsCountries = COUNTRY_ROLES.includes(role);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createAccountAction(state, formData);
      setState(result);
      if (result.handOut) {
        form.reset();
        setRole("");
      }
    });
  }

  const errors = state.fieldErrors ?? {};
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FieldShell
          id="account-email"
          label="Email address"
          error={errors.email}
        >
          <TextInput
            {...describe("account-email", undefined, errors.email)}
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </FieldShell>
        <FieldShell id="account-name" label="Full name" error={errors.name}>
          <TextInput
            {...describe("account-name", undefined, errors.name)}
            name="name"
            autoComplete="off"
            required
          />
        </FieldShell>
        <FieldShell id="account-organisation" label="Organisation">
          <TextInput id="account-organisation" name="organisation" />
        </FieldShell>
        <FieldShell id="account-job" label="Job title">
          <TextInput id="account-job" name="jobTitle" />
        </FieldShell>
        <FieldShell
          id="account-role"
          label="Role"
          hint={role ? ROLE_HINT[role as UserRole] : undefined}
          error={errors.role}
          className="sm:col-span-2"
        >
          <Select
            {...describe("account-role", role, errors.role)}
            name="role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="" disabled>
              Choose a role
            </option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </FieldShell>
        {needsCountries ? (
          <fieldset
            className="flex flex-col gap-2 sm:col-span-2"
            aria-describedby={
              errors.countryIds ? "account-countries-error" : undefined
            }
          >
            <legend className="text-sm font-semibold">Countries</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {countries.map((country) => (
                <label
                  key={country.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="countryIds"
                    value={country.id}
                    className="size-4 accent-brand-teal"
                  />
                  {country.name}
                </label>
              ))}
            </div>
            {errors.countryIds ? (
              <p
                id="account-countries-error"
                className="text-xs text-destructive"
              >
                {errors.countryIds}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
      {state.error && !state.handOut ? (
        <Notice tone="error">{state.error}</Notice>
      ) : null}
      <HandOut handOut={state.handOut} />
    </div>
  );
}

/** New temporary password for someone who forgot theirs; asks for confirmation first. */
export function ResetPasswordForm({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [state, setState] = useState<AccountFormState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !window.confirm(
              `Give ${name} a new temporary password? Their current password stops working and they are signed out.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            setState(await resetPasswordAction(userId, name));
          });
        }}
      >
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Resetting…" : "New temporary password"}
        </Button>
      </form>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <HandOut handOut={state.handOut} />
    </div>
  );
}
