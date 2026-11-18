"use client";

import { useActionState } from "react";
import {
  uploadTeaserAction,
  type WorkspaceFormState,
} from "@/app/(portal)/workspace/actions";
import { Button } from "@/components/ui/button";
import { formatBytes, MAX_TEASER_BYTES } from "@/lib/workspace/teaser-file";
import { AcknowledgementFields } from "./acknowledgement-fields";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "./form-controls";

const initial: WorkspaceFormState = {};

/**
 * Upload a teaser version (PDF, max 25 MB). On a published project the confirmation is required at upload,
 * because the new version replaces what investors see. Shown only when the policy module allows uploading.
 */
export function TeaserUploadForm({
  projectId,
  nextVersion,
  published,
  acknowledgementText,
  onBehalf,
  defaultAllowDownload,
}: {
  projectId: string;
  nextVersion: number;
  published: boolean;
  acknowledgementText: string;
  onBehalf: boolean;
  defaultAllowDownload: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    uploadTeaserAction.bind(null, projectId),
    initial,
  );
  const e = state.fieldErrors ?? {};
  const hint = `PDF only, up to ${formatBytes(MAX_TEASER_BYTES)}. Checked for viruses on upload. PowerPoint files: save as PDF first.`;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
      <FieldShell
        id="teaser-file"
        label={
          nextVersion === 1
            ? "Project teaser"
            : `Project teaser, version ${nextVersion}`
        }
        hint={hint}
        error={e.teaser}
      >
        <input
          {...describe("teaser-file", hint, e.teaser)}
          type="file"
          name="teaser"
          accept="application/pdf,.pdf"
          required
          className="rounded-lg border-2 border-dashed border-brand-aqua/70 bg-secondary/40 p-6 text-sm file:me-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:font-medium file:text-primary-foreground"
        />
      </FieldShell>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell id="teaser-title" label="Title shown to investors">
          <TextInput
            id="teaser-title"
            name="title"
            defaultValue="Project teaser"
            maxLength={200}
          />
        </FieldShell>
        <FieldShell id="teaser-date" label="Teaser date (optional)">
          <TextInput id="teaser-date" type="date" name="docDate" />
        </FieldShell>
      </div>
      <FieldShell id="teaser-download" label="Allow download?">
        <Select
          id="teaser-download"
          name="allowDownload"
          defaultValue={defaultAllowDownload ? "download" : "view"}
        >
          <option value="view">View only (recommended)</option>
          <option value="download">Allow download</option>
        </Select>
      </FieldShell>
      {published ? (
        <AcknowledgementFields
          idPrefix="upload"
          text={acknowledgementText}
          onBehalf={onBehalf}
          errors={e}
        />
      ) : null}
      <div>
        <Button type="submit" size="lg" variant="outline" disabled={pending}>
          {pending ? "Uploading…" : "Upload teaser"}
        </Button>
      </div>
    </form>
  );
}
