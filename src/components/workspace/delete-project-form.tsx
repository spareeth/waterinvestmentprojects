"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  deleteProjectAction,
  type WorkspaceFormState,
} from "@/app/(portal)/workspace/actions";
import { Button } from "@/components/ui/button";
import { describe, FieldShell, Notice, TextInput } from "./form-controls";

/**
 * Delete a project for good (23 Nov). The person types the title to confirm; the server checks the permission
 * again (canDeleteProject) and, on success, sends them back to the project list.
 */
export function DeleteProjectForm({
  projectId,
  title,
  hasRequests,
}: {
  projectId: string;
  title: string;
  /** Mention that open meeting requests are cancelled and everyone is told. */
  hasRequests: boolean;
}) {
  const [state, setState] = useState<WorkspaceFormState>({});
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === title.trim().toLowerCase();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches) return;
    startTransition(async () => {
      setState(await deleteProjectAction(projectId, typed));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <p className="text-sm text-muted-foreground">
        Deleting removes the project, its teaser files
        {hasRequests ? " and its meeting requests" : ""} for good. This cannot
        be undone.
        {hasRequests
          ? " Open meeting requests are cancelled first, and the investors, the country and the Summit mailbox are told."
          : ""}{" "}
        The record of the government&apos;s consent stays.
      </p>
      <FieldShell
        id="delete-confirm"
        label="Type the project's title to confirm"
        hint={title}
      >
        <TextInput
          {...describe("delete-confirm", title)}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
        />
      </FieldShell>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !matches}
        >
          {pending ? "Deleting…" : "Delete project"}
        </Button>
      </div>
    </form>
  );
}
