"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useState,
  useTransition,
} from "react";
import {
  type AdminFormState,
  addContactAction,
  createCountryAction,
  removeContactAction,
  setCountryStatusAction,
  updateContactAction,
} from "@/app/(portal)/admin/countries/actions";
import { setAccountStatusAction } from "@/app/(portal)/admin/accounts/status-actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "@/components/workspace/form-controls";
import { CountryContactRole } from "@/generated/prisma/enums";
import { CONTACT_ROLE_LABEL } from "@/lib/admin/contacts-input";
import { searchWorldCountries, type WorldCountry } from "@/lib/countries/world";

// Countries, contacts and account switches for the admin console (M7). Forms call their server actions from a
// submit handler (not useActionState), like the upload link forms, because of the production hydration problem
// noted there.

type FormAction = (
  prev: AdminFormState,
  formData: FormData,
) => Promise<AdminFormState>;

function useFormAction(
  action: FormAction,
  resetOnSuccess = false,
  onSuccess?: () => void,
) {
  const [state, setState] = useState<AdminFormState>({});
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const next = await action(state, formData);
      setState(next);
      if (resetOnSuccess && !next.error) form.reset();
      if (!next.error) onSuccess?.();
    });
  }
  return { state, pending, submit };
}

function Messages({ state }: { state: AdminFormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * Add a country: type a few letters of the name (or another common name, or the ISO code) and pick it from the
 * list, which fills in the name and ISO code. Both stay editable, so a country missing from the list can still be
 * typed in by hand. `existing` holds the ISO codes already added, shown as such in the list.
 */
export function CreateCountryForm({
  existing = [],
}: {
  existing?: readonly string[];
}) {
  const [name, setName] = useState("");
  const [iso3, setIso3] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { state, pending, submit } = useFormAction(
    createCountryAction,
    true,
    () => {
      setName("");
      setIso3("");
      setOpen(false);
    },
  );
  const fe = state.fieldErrors ?? {};
  const listId = useId();
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  const matches = open ? searchWorldCountries(name) : [];
  const shown = matches.length > 0;

  function pick(country: WorldCountry) {
    setName(country.name);
    setIso3(country.iso3);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      if (!shown) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (event.key === "Enter" && shown) {
      event.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start">
        <FieldShell
          id="country-name"
          label="Country name"
          hint="Type a few letters and pick the country; the ISO code fills in."
          error={fe.name}
        >
          <div className="relative">
            <TextInput
              name="name"
              required
              maxLength={100}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={shown}
              aria-controls={listId}
              aria-activedescendant={
                shown ? `${listId}-${matches[active]?.iso3}` : undefined
              }
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setOpen(true);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setOpen(false)}
              {...describe("country-name", true, fe.name)}
            />
            {shown ? (
              <ul
                id={listId}
                role="listbox"
                aria-label="Matching countries"
                className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border bg-card py-1 shadow-lg"
              >
                {matches.map((country, i) => {
                  const added = taken.has(country.iso3);
                  return (
                    <li
                      key={country.iso3}
                      id={`${listId}-${country.iso3}`}
                      role="option"
                      aria-selected={i === active}
                      // mousedown, not click: picking must happen before the input's blur closes the list.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(country);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                        i === active ? "bg-muted" : ""
                      }`}
                    >
                      <span>{country.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {added
                          ? `${country.iso3}, already added`
                          : country.iso3}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </FieldShell>
        <FieldShell
          id="country-iso3"
          label="ISO code (3 letters)"
          error={fe.iso3}
        >
          <TextInput
            name="iso3"
            required
            maxLength={3}
            autoCapitalize="characters"
            className="uppercase"
            value={iso3}
            onChange={(event) => setIso3(event.target.value.toUpperCase())}
            {...describe("country-iso3", null, fe.iso3)}
          />
        </FieldShell>
        <Button type="submit" disabled={pending} className="h-10 sm:mt-7">
          {pending ? "Adding" : "Add country"}
        </Button>
      </div>
      <Messages state={state} />
    </form>
  );
}

export function CountryStatusButton({
  countryId,
  name,
  active,
}: {
  countryId: string;
  name: string;
  active: boolean;
}) {
  const [state, setState] = useState<AdminFormState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="sm"
        variant={active ? "destructive" : "outline"}
        disabled={pending}
        onClick={() => {
          if (
            active &&
            !window.confirm(
              `Switch off ${name}? Its projects leave the pipeline and its upload link stops working. Nothing is deleted, and you can switch it on again.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            setState(await setCountryStatusAction(countryId, !active));
          });
        }}
      >
        {active ? "Switch off" : "Switch on"}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </div>
  );
}

const ROLES = Object.values(CountryContactRole);

/** Adds a contact, or edits one when `contact` is given. */
export function ContactForm({
  countryId,
  contact,
}: {
  countryId: string;
  contact?: {
    id: string;
    name: string;
    email: string;
    role: CountryContactRole;
  };
}) {
  const action = contact
    ? updateContactAction.bind(null, contact.id)
    : addContactAction.bind(null, countryId);
  const { state, pending, submit } = useFormAction(action, !contact);
  const fe = state.fieldErrors ?? {};
  const prefix = contact ? `contact-${contact.id}` : `contact-new-${countryId}`;
  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_12rem_auto] md:items-end">
        <FieldShell id={`${prefix}-name`} label="Name" error={fe.name}>
          <TextInput
            name="name"
            required
            maxLength={120}
            defaultValue={contact?.name}
            {...describe(`${prefix}-name`, null, fe.name)}
          />
        </FieldShell>
        <FieldShell id={`${prefix}-email`} label="Email" error={fe.email}>
          <TextInput
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={contact?.email}
            {...describe(`${prefix}-email`, null, fe.email)}
          />
        </FieldShell>
        <FieldShell id={`${prefix}-role`} label="Role" error={fe.role}>
          <Select
            name="role"
            required
            defaultValue={contact?.role ?? CountryContactRole.FOCAL_POINT}
            {...describe(`${prefix}-role`, null, fe.role)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {CONTACT_ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
        </FieldShell>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? "Saving" : contact ? "Save" : "Add contact"}
        </Button>
      </div>
      <Messages state={state} />
    </form>
  );
}

export function RemoveContactButton({
  contactId,
  name,
}: {
  contactId: string;
  name: string;
}) {
  const [state, setState] = useState<AdminFormState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Remove ${name} as a contact? Their account, if any, stays.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            setState(await removeContactAction(contactId));
          });
        }}
      >
        Remove
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </div>
  );
}

export function AccountStatusButton({
  userId,
  name,
  active,
}: {
  userId: string;
  name: string;
  active: boolean;
}) {
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="sm"
        variant={active ? "destructive" : "outline"}
        disabled={pending}
        onClick={() => {
          if (
            active &&
            !window.confirm(
              `Switch off the account of ${name}? They are signed out at once and cannot sign in until it is switched on again.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            setState(await setAccountStatusAction(userId, !active));
          });
        }}
      >
        {active ? "Switch off account" : "Switch account on"}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </div>
  );
}
