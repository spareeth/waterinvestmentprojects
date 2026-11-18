"use client";

import { useActionState, useState } from "react";
import {
  createUploadLinkAction,
  type LinkFormState,
  revokeUploadLinkAction,
} from "@/app/(portal)/admin/upload-links/actions";
import { Button } from "@/components/ui/button";
import { Notice, TextInput } from "@/components/workspace/form-controls";

const initial: LinkFormState = {};

/** Creates (or replaces) a link and shows its URL once, with a copy button. */
export function CreateLinkForm({
  countryId,
  label,
  defaultDate,
  replaces,
}: {
  countryId: string | null;
  /** Accessible name, e.g. "Country A" or "generic link". */
  label: string;
  defaultDate: string;
  /** True when the country already has a link that this one will replace. */
  replaces: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createUploadLinkAction.bind(null, countryId),
    initial,
  );
  const [copied, setCopied] = useState(false);
  const dateId = `expires-${countryId ?? "generic"}`;
  return (
    <div className="flex flex-col gap-3">
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          if (
            replaces &&
            !window.confirm(
              `Create a new link for ${label}? The current link stops working at once.`,
            )
          ) {
            event.preventDefault();
          }
          setCopied(false);
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={dateId} className="text-xs font-semibold">
            Works until (end of day, UAE time)
          </label>
          <TextInput
            id={dateId}
            type="date"
            name="expiresOn"
            defaultValue={defaultDate}
            required
            className="w-44"
          />
        </div>
        <Button
          type="submit"
          variant={replaces ? "outline" : "default"}
          disabled={pending}
        >
          {pending ? "Creating…" : replaces ? "Replace link" : "Create link"}
        </Button>
      </form>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.created ? (
        <div className="flex flex-col gap-2 rounded-lg border border-ack-border bg-ack-surface p-3 text-sm">
          <p className="font-semibold">
            New link for {label}, works until {state.created.expiresAt}. Copy it
            now: it is shown only once.
          </p>
          <div className="flex flex-wrap gap-2">
            <TextInput
              aria-label={`Upload link for ${label}`}
              value={state.created.url}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!state.created) return;
                await navigator.clipboard.writeText(state.created.url);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Revokes a link after a confirmation tick. */
export function RevokeLinkForm({
  linkId,
  label,
}: {
  linkId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    revokeUploadLinkAction.bind(null, linkId),
    initial,
  );
  const boxId = `revoke-${linkId}`;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <label htmlFor={boxId} className="flex items-center gap-2 text-xs">
        <input id={boxId} type="checkbox" name="confirm" value="yes" />
        Stop the link for {label}
      </label>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
    </form>
  );
}
