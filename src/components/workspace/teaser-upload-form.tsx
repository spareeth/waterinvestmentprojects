"use client";

import { useActionState } from "react";
import {
  uploadTeaserAction,
  type WorkspaceFormState,
} from "@/app/(portal)/workspace/actions";
import { Button } from "@/components/ui/button";
import {
  formatBytes,
  MAX_TEASER_BYTES,
  SUBMISSION_ACCEPT,
} from "@/lib/workspace/teaser-file";
import { AcknowledgementFields } from "./acknowledgement-fields";
import { DownloadSelect } from "./download-select";
import { describe, FieldShell, Notice } from "./form-controls";

const initial: WorkspaceFormState = {};

/**
 * Upload a teaser version (PDF, max 25 MB). The consent tick is required on every upload: the service stores it as
 * a Submission that the new file points at. Shown only when the policy module allows uploading.
 */
export function TeaserUploadForm({
  projectId,
  nextVersion,
  acknowledgementText,
  defaultAllowDownload,
}: {
  projectId: string;
  nextVersion: number;
  acknowledgementText: string;
  defaultAllowDownload: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    uploadTeaserAction.bind(null, projectId),
    initial,
  );
  const e = state.fieldErrors ?? {};
  const hint = `PDF preferred; PowerPoint, Word, Excel, OpenDocument, RTF and images are also accepted. Up to ${formatBytes(MAX_TEASER_BYTES)}, checked for viruses on upload. Investors only see PDFs: add a PDF version before publishing.`;
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
          accept={SUBMISSION_ACCEPT}
          required
          className="rounded-lg border-2 border-dashed border-brand-aqua/70 bg-secondary/40 p-6 text-sm file:me-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:font-medium file:text-primary-foreground"
        />
      </FieldShell>
      <DownloadSelect
        id="teaser-download"
        allowDownload={defaultAllowDownload}
      />
      <AcknowledgementFields
        idPrefix="upload"
        text={acknowledgementText}
        errors={e}
      />
      <div>
        <Button type="submit" size="lg" variant="outline" disabled={pending}>
          {pending ? "Uploading…" : "Upload teaser"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The consent is recorded with your name, date and time.
      </p>
    </form>
  );
}
