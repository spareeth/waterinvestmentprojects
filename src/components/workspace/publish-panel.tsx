"use client";

import { useActionState } from "react";
import {
  publishProjectAction,
  setTeaserDownloadAction,
  withdrawProjectAction,
  type WorkspaceFormState,
} from "@/app/(portal)/workspace/actions";
import { Button } from "@/components/ui/button";
import { AcknowledgementFields } from "./acknowledgement-fields";
import { FieldShell, Notice, Select } from "./form-controls";

const initial: WorkspaceFormState = {};

function DownloadSelect({
  id,
  allowDownload,
}: {
  id: string;
  allowDownload: boolean;
}) {
  return (
    <FieldShell id={id} label="Allow download?">
      <Select
        id={id}
        name="allowDownload"
        defaultValue={allowDownload ? "download" : "view"}
      >
        <option value="view">View only (recommended)</option>
        <option value="download">Allow download</option>
      </Select>
    </FieldShell>
  );
}

/** "Before you publish": confirmation, download choice and the publish button (mockup 04). */
export function PublishForm({
  projectId,
  acknowledgementText,
  onBehalf,
  teaser,
}: {
  projectId: string;
  acknowledgementText: string;
  onBehalf: boolean;
  /** The current CLEAN teaser, or null when there is nothing to publish yet. */
  teaser: { version: number; allowDownload: boolean } | null;
}) {
  const [state, formAction, pending] = useActionState(
    publishProjectAction.bind(null, projectId),
    initial,
  );
  const e = state.fieldErrors ?? {};
  if (!teaser) {
    return (
      <Notice tone="info">
        Upload a teaser first. You can publish once its virus check has passed.
      </Notice>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
      <p className="text-sm text-muted-foreground">
        You are publishing teaser version {teaser.version}.
      </p>
      <AcknowledgementFields
        idPrefix="publish"
        text={acknowledgementText}
        onBehalf={onBehalf}
        errors={e}
      />
      <DownloadSelect
        id="publish-download"
        allowDownload={teaser.allowDownload}
      />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Publishing…" : "Publish to the pipeline"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The confirmation is recorded with your name, date and time in the audit
        log.
      </p>
    </form>
  );
}

/** Download on or off for the live teaser of a published project. */
export function DownloadForm({
  documentId,
  allowDownload,
}: {
  documentId: string;
  allowDownload: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    setTeaserDownloadAction.bind(null, documentId),
    initial,
  );
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
      <DownloadSelect id="live-download" allowDownload={allowDownload} />
      <div>
        <Button type="submit" variant="outline" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save download setting"}
        </Button>
      </div>
    </form>
  );
}

/** Take a published project out of the pipeline. */
export function WithdrawForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    withdrawProjectAction.bind(null, projectId),
    initial,
  );
  const error = state.fieldErrors?.confirm;
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "withdraw-error" : undefined}
          className="mt-0.5 size-4 accent-brand-teal"
        />
        <span>
          Withdraw this project. Investors will no longer see it, and it can be
          published again later.
        </span>
      </label>
      {error ? (
        <p id="withdraw-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          type="submit"
          variant="destructive"
          size="lg"
          disabled={pending}
        >
          {pending ? "Withdrawing…" : "Withdraw from the pipeline"}
        </Button>
      </div>
    </form>
  );
}
