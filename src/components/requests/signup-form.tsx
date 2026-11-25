"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  saveSignupAction,
  type SignupFormState,
  withdrawSignupAction,
} from "@/app/(portal)/requests/signup-actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Textarea,
  TextInput,
} from "@/components/workspace/form-controls";
import type { SignupDay } from "@/lib/meetings/signups";
import { cn } from "@/lib/utils";

// The meeting sign-up sheet (25 Nov). Like the other forms it calls its server action from a submit handler. Every
// time is a plain checkbox, so the sheet works with the keyboard and a screen reader; ticked times show as "Your
// choice", the others as "Potential option".

export interface SignupDefaults {
  contactName: string;
  contactEmail: string;
  organisation: string;
  role: string;
  note: string;
}

export function SignupForm({
  projectId,
  countryName,
  days,
  projects,
  defaults,
  signupId,
  closed,
}: {
  projectId: string;
  countryName: string;
  days: SignupDay[];
  projects: { id: string; title: string; chosen: boolean }[];
  defaults: SignupDefaults;
  /** The investor's active sign-up for this country, if any. */
  signupId: string | null;
  closed: boolean;
}) {
  const [state, setState] = useState<SignupFormState>({});
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<Set<string>>(
    () =>
      new Set(
        days.flatMap((d) =>
          d.times.filter((t) => t.chosen).map((t) => t.value),
        ),
      ),
  );
  const errors = state.fieldErrors ?? {};

  function toggle(value: string, on: boolean) {
    setChosen((now) => {
      const next = new Set(now);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () =>
      setState(await saveSignupAction(projectId, data)),
    );
  }

  if (days.length === 0) {
    return (
      <Notice tone="info">
        Meeting times for {countryName} are being set up. Please check again
        soon.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <fieldset
        className="flex flex-col gap-3 rounded-xl border border-water-100 bg-water-50 p-4"
        aria-describedby={errors.slots ? "signup-slots-error" : "signup-hint"}
        disabled={closed}
      >
        <legend className="float-left mb-1 w-full text-sm font-semibold text-brand-navy">
          When could you meet the {countryName} delegation?
        </legend>
        <p id="signup-hint" className="text-xs text-muted-foreground">
          20-minute bilateral meetings, UAE time. Tick every time you could
          make: the more you tick, the easier it is to match you.
        </p>
        <ul
          aria-label="Legend"
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-4 w-6 rounded border border-water-300 bg-white"
            />
            Potential option
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-4 w-6 rounded border border-water-700 bg-water-700"
            />
            Your choice
          </li>
        </ul>
        {errors.slots ? (
          <p
            id="signup-slots-error"
            className="text-sm font-medium text-destructive"
          >
            {errors.slots}
          </p>
        ) : null}
        {days.map((day) => (
          <div
            key={day.key}
            role="group"
            aria-label={day.label}
            className="flex flex-col gap-2"
          >
            <p className="text-sm font-medium">{day.label}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
              {day.times.map((t) => {
                const on = chosen.has(t.value);
                return (
                  <label
                    key={t.value}
                    className={cn(
                      "flex cursor-pointer items-center justify-center rounded-lg border px-2 py-1.5 text-center text-sm font-medium focus-within:ring-3 focus-within:ring-brand-aqua/60",
                      on
                        ? "border-water-700 bg-water-700 text-white"
                        : "border-water-300 bg-white text-water-800 hover:border-water-700",
                      closed && "cursor-not-allowed opacity-70",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="slot"
                      value={t.value}
                      checked={on}
                      onChange={(event) =>
                        toggle(t.value, event.target.checked)
                      }
                      className="sr-only"
                    />
                    {t.label}
                    <span className="sr-only">
                      {on ? ", your choice" : ", potential option"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      {projects.length > 1 ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={
            errors.projects ? "signup-projects-error" : undefined
          }
          disabled={closed}
        >
          <legend className="text-sm font-semibold">
            Projects you would like to discuss
          </legend>
          {projects.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="project"
                value={p.id}
                defaultChecked={p.chosen}
                className="mt-0.5 size-4 accent-brand-teal"
              />
              {p.title}
            </label>
          ))}
          {errors.projects ? (
            <p id="signup-projects-error" className="text-xs text-destructive">
              {errors.projects}
            </p>
          ) : null}
        </fieldset>
      ) : (
        projects.map((p) => (
          <input key={p.id} type="hidden" name="project" value={p.id} />
        ))
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id="signup-name"
          label="Who will attend"
          error={errors.contactName}
        >
          <TextInput
            {...describe("signup-name", undefined, errors.contactName)}
            name="contactName"
            defaultValue={defaults.contactName}
            autoComplete="name"
            disabled={closed}
          />
        </FieldShell>
        <FieldShell
          id="signup-email"
          label="Their email"
          error={errors.contactEmail}
        >
          <TextInput
            {...describe("signup-email", undefined, errors.contactEmail)}
            name="contactEmail"
            type="email"
            defaultValue={defaults.contactEmail}
            autoComplete="email"
            disabled={closed}
          />
        </FieldShell>
        <FieldShell
          id="signup-organisation"
          label="Organisation"
          error={errors.organisation}
        >
          <TextInput
            {...describe("signup-organisation", undefined, errors.organisation)}
            name="organisation"
            defaultValue={defaults.organisation}
            autoComplete="organization"
            disabled={closed}
          />
        </FieldShell>
        <FieldShell id="signup-role" label="Role" error={errors.role}>
          <TextInput
            {...describe("signup-role", undefined, errors.role)}
            name="role"
            defaultValue={defaults.role}
            autoComplete="organization-title"
            disabled={closed}
          />
        </FieldShell>
      </div>
      <FieldShell
        id="signup-note"
        label="Note (optional)"
        hint="For example the topics you would like to discuss."
        error={errors.note}
      >
        <Textarea
          {...describe(
            "signup-note",
            "For example the topics you would like to discuss.",
            errors.note,
          )}
          name="note"
          rows={3}
          defaultValue={defaults.note}
          disabled={closed}
        />
      </FieldShell>

      {state.error && !state.fieldErrors?.slots ? (
        <Notice tone="error">{state.error}</Notice>
      ) : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}

      {closed ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : signupId
                ? "Update my sign-up"
                : "Sign up for a meeting"}
          </Button>
          {signupId ? <WithdrawSignupButton signupId={signupId} /> : null}
        </div>
      )}
    </form>
  );
}

function WithdrawSignupButton({ signupId }: { signupId: string }) {
  const [state, setState] = useState<SignupFormState>({});
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Withdraw your sign-up for this country? You can sign up again until sign-ups close.",
            )
          ) {
            return;
          }
          startTransition(async () =>
            setState(await withdrawSignupAction(signupId)),
          );
        }}
      >
        {pending ? "Withdrawing…" : "Withdraw my sign-up"}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </>
  );
}
