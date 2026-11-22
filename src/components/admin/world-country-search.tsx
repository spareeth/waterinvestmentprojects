"use client";

import { type KeyboardEvent, useId, useState } from "react";
import {
  describe,
  FieldShell,
  TextInput,
} from "@/components/workspace/form-controls";
import { searchWorldCountries, type WorldCountry } from "@/lib/countries/world";

/**
 * Type a few letters of a country (or another common name, or the ISO code) and pick it from the world list
 * (22 Nov). Used by Add country and by the account form. `existing` holds ISO codes already in the portal,
 * marked as such in the list. With `name`, the typed text is also submitted with the form.
 */
export function WorldCountrySearch({
  id,
  label,
  hint,
  error,
  name,
  required,
  value,
  onValueChange,
  onPick,
  existing = [],
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  name?: string;
  required?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onPick: (country: WorldCountry) => void;
  existing?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  const matches = open ? searchWorldCountries(value) : [];
  const shown = matches.length > 0;

  function pick(country: WorldCountry) {
    setOpen(false);
    onPick(country);
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
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <TextInput
          name={name}
          required={required}
          maxLength={100}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={listId}
          aria-activedescendant={
            shown ? `${listId}-${matches[active]?.iso3}` : undefined
          }
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          {...describe(id, hint, error)}
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
                    {added ? `${country.iso3}, already added` : country.iso3}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </FieldShell>
  );
}
