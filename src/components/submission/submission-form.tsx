"use client";

import Link from "next/link";
import { type FormEvent, useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "@/components/workspace/form-controls";
import { FIELD_MESSAGES } from "@/lib/submission/errors";
import type {
  SubmitFormState,
  SubmitFormValues,
} from "@/lib/submission/form-data";
import {
  GOVERNMENT_ORGANISATION_MAX,
  MAX_SUBMISSION_BYTES,
  MAX_TEASERS_PER_SUBMISSION,
  SUBMISSION_FIELDS as F,
  SUBMISSION_SECTORS,
} from "@/lib/submission/input";
import {
  formatBytes,
  MAX_TEASER_BYTES,
  SUBMISSION_ACCEPT,
  typeFromExtension,
} from "@/lib/workspace/teaser-file";

const initial: SubmitFormState = {};

let nextRowId = 1;

/**
 * Government upload form (M0, PLAN v0.3 F0; M11, PLAN v0.4 0b.2 to 0b.5): country (fixed by the link, or chosen
 * on the generic link), full name, email, job title and represented government organisation (all required), one
 * or more teasers with a sector each, and one acknowledgement for the whole submission. Sizes and file name
 * extensions are checked here first so nobody waits for an upload that would be refused; the server checks
 * everything again, including the file contents.
 */
export function SubmissionForm({
  action,
  countryName,
  countries,
  acknowledgementText,
  defaults,
  workspace = false,
}: {
  /** The server action: the upload link one bound to its token, or the My projects one (22 Nov). */
  action: (
    prev: SubmitFormState,
    formData: FormData,
  ) => Promise<SubmitFormState>;
  /** Set when the country is fixed (country link, or a focal point with one country). */
  countryName: string | null;
  /** The countries to choose from when it is not fixed. */
  countries: { id: string; name: string }[];
  acknowledgementText: string;
  /** Prefilled values, for example the signed-in person's name and email. */
  defaults?: SubmitFormValues;
  /** My projects instead of an upload link: the confirmation leads back to the projects. */
  workspace?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [rows, setRows] = useState<number[]>([0]);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  if (state.receipt) {
    const r = state.receipt;
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">
          Thank you. We received {r.files.length}{" "}
          {r.files.length === 1 ? "teaser" : "teasers"} for {r.countryName}.
        </Notice>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="font-semibold">Reference</dt>
          <dd className="font-mono break-all">{r.submissionId}</dd>
          <dt className="font-semibold">Sent by</dt>
          <dd>
            {r.uploaderName}, {r.uploaderEmail}
          </dd>
          <dt className="font-semibold">Job title</dt>
          <dd>{r.uploaderJobTitle}</dd>
          <dt className="font-semibold">Organisation</dt>
          <dd>{r.governmentOrganisation}</dd>
          <dt className="font-semibold">Received</dt>
          <dd>{r.acceptedAt}</dd>
        </dl>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {r.files.map((f, i) => (
            <li key={i} className="flex flex-col gap-0.5 p-3">
              <span className="font-medium">{f.filename}</span>
              <span className="text-muted-foreground">Sector: {f.sector}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-ack-border bg-ack-surface p-3 text-sm leading-relaxed">
          <p className="font-semibold">You confirmed:</p>
          <p className="mt-1">{acknowledgementText}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {r.emailSent
            ? `We have also emailed this confirmation to ${r.uploaderEmail}. You can print or save this page too.`
            : "Please print or save this page, or note the reference."}{" "}
          {workspace
            ? "The projects are now in My projects as drafts; the Summit team checks each teaser before publishing it. To replace a file, send it again and tell the Summit team which one it replaces."
            : "To replace a file, send it again through this link and tell the Summit team which one it replaces."}
        </p>
        <div className="flex flex-wrap gap-3 print:hidden">
          {workspace ? (
            <Button asChild>
              <Link href="/workspace">Back to My projects</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={workspace ? "outline" : "default"}
            onClick={() => window.print()}
          >
            Print or save this page
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Send more teasers
          </Button>
        </div>
      </div>
    );
  }

  const e = { ...(state.fieldErrors ?? {}), ...localErrors };
  const v = state.values ?? defaults ?? {};

  function checkSizes(event: FormEvent<HTMLFormElement>) {
    const errors: Record<string, string> = {};
    let total = 0;
    rows.forEach((_, i) => {
      const input = formRef.current?.elements.namedItem(F.teaser(i));
      const file =
        input instanceof HTMLInputElement ? input.files?.[0] : undefined;
      if (!file) return;
      total += file.size;
      if (typeFromExtension(file.name) === null) {
        errors[F.teaser(i)] = FIELD_MESSAGES.file_wrong_type;
      } else if (file.size > MAX_TEASER_BYTES) {
        errors[F.teaser(i)] = FIELD_MESSAGES.file_too_large;
      }
    });
    if (total > MAX_SUBMISSION_BYTES) {
      errors.teasers = FIELD_MESSAGES.totalTooLarge;
    }
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) event.preventDefault();
  }

  const fileHint = `PDF preferred; PowerPoint, Word, Excel and images are also accepted. Up to ${formatBytes(MAX_TEASER_BYTES)} each.`;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={checkSizes}
      className="flex flex-col gap-6"
      noValidate
    >
      {state.error ? (
        <Notice tone="error">
          {state.error}
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 0
            ? " Please choose the files again before sending."
            : ""}
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {countryName ? (
          <FieldShell id="submit-country" label="Country">
            <TextInput
              id="submit-country"
              value={countryName}
              readOnly
              aria-readonly
              className="bg-muted"
            />
          </FieldShell>
        ) : (
          <FieldShell
            id="submit-country"
            label="Country"
            error={e[F.countryId]}
            hint={
              countries.length === 0
                ? "No countries are open for uploads yet. Please contact the Summit team."
                : undefined
            }
            className="sm:col-span-2"
          >
            <Select
              {...describe(
                "submit-country",
                countries.length === 0 ? "hint" : undefined,
                e[F.countryId],
              )}
              name={F.countryId}
              defaultValue={v.countryId ?? ""}
              required
            >
              <option value="" disabled>
                Choose your country
              </option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FieldShell>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id="submit-name"
          label="Full name"
          error={e[F.uploaderName]}
        >
          <TextInput
            {...describe("submit-name", undefined, e[F.uploaderName])}
            name={F.uploaderName}
            autoComplete="name"
            defaultValue={v.uploaderName ?? ""}
            maxLength={200}
            required
          />
        </FieldShell>
        <FieldShell
          id="submit-email"
          label="Email"
          hint="We send your confirmation here, and the Summit team uses it if they have questions. Unless they are told otherwise, it also becomes your country's contact for meeting requests."
          error={e[F.uploaderEmail]}
        >
          <TextInput
            {...describe("submit-email", true, e[F.uploaderEmail])}
            name={F.uploaderEmail}
            type="email"
            autoComplete="email"
            defaultValue={v.uploaderEmail ?? ""}
            maxLength={254}
            required
          />
        </FieldShell>
        <FieldShell
          id="submit-job-title"
          label="Job title"
          error={e[F.uploaderJobTitle]}
        >
          <TextInput
            {...describe("submit-job-title", undefined, e[F.uploaderJobTitle])}
            name={F.uploaderJobTitle}
            autoComplete="organization-title"
            defaultValue={v.uploaderJobTitle ?? ""}
            maxLength={120}
            required
          />
        </FieldShell>
        <FieldShell
          id="submit-organisation"
          label="Represented government organisation"
          hint="The ministry, utility or agency you send these teasers for, for example Ministry of Water Resources."
          error={e[F.governmentOrganisation]}
        >
          <TextInput
            {...describe(
              "submit-organisation",
              true,
              e[F.governmentOrganisation],
            )}
            name={F.governmentOrganisation}
            autoComplete="organization"
            defaultValue={v.governmentOrganisation ?? ""}
            maxLength={GOVERNMENT_ORGANISATION_MAX}
            required
          />
        </FieldShell>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-semibold text-foreground">
          Project teasers
        </legend>
        <p className="text-xs text-muted-foreground">
          One file per project. {fileHint} You can send up to{" "}
          {MAX_TEASERS_PER_SUBMISSION} at a time,{" "}
          {formatBytes(MAX_SUBMISSION_BYTES)} in total.
        </p>
        {e.teasers ? (
          <p className="text-xs text-destructive" role="alert">
            {e.teasers}
          </p>
        ) : null}
        {rows.map((rowId, i) => {
          const sectorId = `submit-sector-${rowId}`;
          const fileId = `submit-file-${rowId}`;
          return (
            <div
              key={rowId}
              className="grid gap-4 rounded-lg border bg-secondary/30 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-start"
            >
              <FieldShell
                id={sectorId}
                label={`Teaser ${i + 1}: sector`}
                hint="Read from the teaser's subtitle unless you choose one."
                error={e[F.sector(i)]}
              >
                <Select
                  {...describe(sectorId, true, e[F.sector(i)])}
                  name={F.sector(i)}
                  defaultValue={v.sectors?.[i] ?? ""}
                >
                  <option value="">Read from the teaser</option>
                  {SUBMISSION_SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </FieldShell>
              <FieldShell
                id={fileId}
                label={`Teaser ${i + 1}: file`}
                error={e[F.teaser(i)]}
              >
                <input
                  {...describe(fileId, undefined, e[F.teaser(i)])}
                  type="file"
                  name={F.teaser(i)}
                  accept={SUBMISSION_ACCEPT}
                  required
                  className="rounded-lg border-2 border-dashed border-brand-aqua/70 bg-card p-3 text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-medium file:text-primary-foreground"
                />
              </FieldShell>
              {rows.length > 1 ? (
                <div className="sm:pt-7">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setRows(rows.filter((r) => r !== rowId));
                      setLocalErrors({});
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {rows.length < MAX_TEASERS_PER_SUBMISSION ? (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows([...rows, nextRowId++])}
            >
              Add another teaser
            </Button>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="submit-acknowledge"
          className="flex items-start gap-3 rounded-lg border border-ack-border bg-ack-surface p-4 text-sm leading-relaxed"
        >
          <input
            id="submit-acknowledge"
            type="checkbox"
            name={F.acknowledge}
            value="yes"
            required
            aria-invalid={e[F.acknowledge] ? true : undefined}
            aria-describedby={
              e[F.acknowledge] ? "submit-acknowledge-error" : undefined
            }
            className="mt-1 size-4 shrink-0 accent-ack"
          />
          <span>{acknowledgementText}</span>
        </label>
        {e[F.acknowledge] ? (
          <p id="submit-acknowledge-error" className="text-xs text-destructive">
            {e[F.acknowledge]}
          </p>
        ) : null}
      </div>

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send teasers"}
        </Button>
      </div>
    </form>
  );
}
