"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  type AdminActionState,
  addApprovedContactsAction,
  addApprovedOrganisationAction,
  decideRegistrationAction,
  removeApprovedContactAction,
  removeApprovedOrganisationAction,
} from "@/app/(portal)/admin/accounts/registration-actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "@/components/workspace/form-controls";

// M13 admin forms. Like the other admin forms they call their server actions from a submit handler, so a result
// cannot vanish when React rebuilds the page.

function Result({ state }: { state: AdminActionState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return null;
}

/** Approve or reject one waiting registration. */
export function RegistrationDecision({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [state, setState] = useState<AdminActionState>({});
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approve" | "reject") => {
    if (
      decision === "reject" &&
      !window.confirm(`Reject the registration of ${name}? This is final.`)
    ) {
      return;
    }
    startTransition(async () => {
      setState(await decideRegistrationAction(userId, decision));
    });
  };
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => decide("approve")}
          aria-label={`Approve ${name}`}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => decide("reject")}
          aria-label={`Reject ${name}`}
        >
          Reject
        </Button>
      </div>
      <Result state={state} />
    </div>
  );
}

function useAdminForm(
  action: (
    prev: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>,
) {
  const [state, setState] = useState<AdminActionState>({});
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action(state, formData);
      setState(result);
      if (result.success) form.reset();
    });
  }
  return { state, pending, submit };
}

/** Adds a pre-approved organisation and its email domains. */
export function AddOrganisationForm() {
  const { state, pending, submit } = useAdminForm(
    addApprovedOrganisationAction,
  );
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell id="org-name" label="Organisation" error={e.name}>
          <TextInput
            {...describe("org-name", undefined, e.name)}
            name="name"
            maxLength={160}
            required
          />
        </FieldShell>
        <FieldShell
          id="org-source"
          label="Source"
          hint="For example: WBG list, 23 Nov."
        >
          <TextInput
            {...describe("org-source", "Source hint")}
            name="source"
            maxLength={120}
          />
        </FieldShell>
      </div>
      <FieldShell
        id="org-domains"
        label="Email domains"
        hint="Everyone registering with an address at these domains is matched, for example bank-one.example. Separate several with commas. Public email services such as gmail.com are refused."
        error={e.domains}
      >
        <TextInput
          {...describe("org-domains", "hint", e.domains)}
          name="domains"
        />
      </FieldShell>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add organisation"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** Adds pre-approved people by email, several at once. */
export function AddContactsForm({
  organisations,
}: {
  organisations: { id: string; name: string }[];
}) {
  const { state, pending, submit } = useAdminForm(addApprovedContactsAction);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FieldShell
        id="contact-emails"
        label="Email addresses"
        hint="One per line, or separated by commas."
        error={e.emails}
      >
        <textarea
          {...describe("contact-emails", "hint", e.emails)}
          name="emails"
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </FieldShell>
      <FieldShell
        id="contact-org"
        label="Organisation (optional)"
        error={e.organisationId}
      >
        <Select
          {...describe("contact-org", undefined, e.organisationId)}
          name="organisationId"
          defaultValue=""
        >
          <option value="">None</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </FieldShell>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add people"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** Removes an organisation or a contact from the pre-approved list. */
export function RemoveFromList({
  kind,
  id,
  label,
}: {
  kind: "organisation" | "contact";
  id: string;
  label: string;
}) {
  const [state, setState] = useState<AdminActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${label}`}
        onClick={() => {
          if (!window.confirm(`Remove ${label} from the pre-approved list?`)) {
            return;
          }
          startTransition(async () => {
            setState(
              kind === "organisation"
                ? await removeApprovedOrganisationAction(id)
                : await removeApprovedContactAction(id),
            );
          });
        }}
      >
        Remove
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </div>
  );
}
