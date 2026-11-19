"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, controlClass } from "@/components/workspace/form-controls";
import {
  parsePipelineFilters,
  pipelineHref,
  type PipelineFilters,
  SIZE_BUCKET_KEYS,
  SIZE_BUCKETS,
} from "@/lib/pipeline/filters";
import { cn } from "@/lib/utils";

export interface FilterOptions {
  countries: { iso3: string; name: string }[];
  sectors: string[];
  pppModels: string[];
  stages: string[];
}

/**
 * The filter bar. A plain GET form, so it works without JavaScript; with JavaScript, a change of any drop-down
 * applies at once and the URL is written in a clean, shareable form (one history entry per change, so the back
 * button steps back through filters). The page re-reads the URL on the server; nothing here decides visibility.
 */
export function PipelineFilterBar({
  filters,
  options,
}: {
  filters: PipelineFilters;
  options: FilterOptions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(form: HTMLFormElement) {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data) {
      if (typeof value === "string") params.append(key, value);
    }
    const href = pipelineHref(parsePipelineFilters(params));
    startTransition(() => router.push(href, { scroll: false }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  const onChange = (event: { currentTarget: HTMLSelectElement }) => {
    if (event.currentTarget.form) apply(event.currentTarget.form);
  };

  return (
    <form
      // Remount when the URL changes (back button, "Clear filters"), so the controls show the current filters.
      key={pipelineHref(filters)}
      action="/pipeline"
      method="get"
      role="search"
      aria-label="Filter projects"
      aria-busy={pending}
      onSubmit={onSubmit}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-opacity",
        pending && "opacity-70",
      )}
    >
      <div className="flex gap-2">
        <label htmlFor="pipeline-q" className="sr-only">
          Search by project title or country
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="pipeline-q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ""}
            maxLength={120}
            placeholder="Search by project title or country"
            className={cn(controlClass, "h-10 pl-9")}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-10 shrink-0"
          disabled={pending}
        >
          {pending ? "Updating" : "Search"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          id="pipeline-country"
          name="country"
          label="Country"
          allLabel="All countries"
          value={filters.country}
          onChange={onChange}
          options={options.countries.map((c) => ({
            value: c.iso3,
            label: c.name,
          }))}
        />
        <FilterSelect
          id="pipeline-sector"
          name="sector"
          label="Sector"
          allLabel="All sectors"
          value={filters.sector}
          onChange={onChange}
          options={options.sectors.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          id="pipeline-ppp"
          name="ppp"
          label="PPP model"
          allLabel="All PPP models"
          value={filters.ppp}
          onChange={onChange}
          options={options.pppModels.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          id="pipeline-size"
          name="size"
          label="Indicative size"
          allLabel="Any size"
          value={filters.size}
          onChange={onChange}
          options={SIZE_BUCKET_KEYS.map((key) => ({
            value: key,
            label: SIZE_BUCKETS[key].label,
          }))}
        />
        <FilterSelect
          id="pipeline-stage"
          name="stage"
          label="Development stage"
          allLabel="All stages"
          value={filters.stage}
          onChange={onChange}
          options={options.stages.map((s) => ({ value: s, label: s }))}
        />
      </div>
    </form>
  );
}

function FilterSelect({
  id,
  name,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (event: { currentTarget: HTMLSelectElement }) => void;
}) {
  // Keep a value from the URL selectable even when no visible project has it (the list then shows no results).
  const all =
    value && !options.some((o) => o.value === value)
      ? [...options, { value, label: value }]
      : options;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="text-xs font-semibold text-muted-foreground"
      >
        {label}
      </label>
      <Select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        onChange={onChange}
      >
        <option value="">{allLabel}</option>
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
