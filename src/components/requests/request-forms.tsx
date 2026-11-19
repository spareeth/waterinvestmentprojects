"use client";

import { useActionState } from "react";
import {
  createMeetingRequestAction,
  decideMeetingRequestAction,
  type RequestFormState,
  withdrawMeetingRequestAction,
} from "@/app/(portal)/requests/actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Textarea,
  TextInput,
} from "@/components/workspace/form-controls";
import { REQUEST_LIMITS, type RequestFormValues } from "@/lib/requests/input";

const initial: RequestFormState = {};

/** Investor: request a bilateral meeting on a project (PLAN v0.3 F5). No ranking, no limit. */
export function MeetingRequestForm({
  projectId,
  defaults,
}: {
  projectId: string;
  defaults: RequestFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    createMeetingRequestAction.bind(null, projectId),
    initial,
  );
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  const values = state.values ?? defaults;
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id="request-organisation"
          label="Organisation"
          error={errors.organisation}
        >
          <TextInput
            {...describe("request-organisation", null, errors.organisation)}
            name="organisation"
            defaultValue={values.organisation}
            maxLength={REQUEST_LIMITS.organisation}
            autoComplete="organization"
            required
          />
        </FieldShell>
        <FieldShell id="request-role" label="Your role" error={errors.role}>
          <TextInput
            {...describe("request-role", null, errors.role)}
            name="role"
            defaultValue={values.role}
            maxLength={REQUEST_LIMITS.role}
            autoComplete="organization-title"
            required
          />
        </FieldShell>
      </div>
      <FieldShell
        id="request-note"
        label="Short note (optional)"
        hint="What you would like to discuss, for example financing, PPP structure or operations."
        error={errors.note}
      >
        <Textarea
          {...describe("request-note", true, errors.note)}
          name="note"
          defaultValue={values.note}
          maxLength={REQUEST_LIMITS.note}
          rows={4}
        />
      </FieldShell>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Request a meeting"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The country&rsquo;s focal point sees your name, email address,
        organisation, role and note, and decides whom to meet. The Summit team
        is told of every request.
      </p>
    </form>
  );
}

/** Investor: withdraw an own pending or accepted request. */
export function WithdrawRequestForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    withdrawMeetingRequestAction.bind(null, requestId),
    initial,
  );
  if (state.success) return <Notice tone="info">{state.success}</Notice>;
  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        if (!window.confirm("Withdraw this meeting request?")) {
          event.preventDefault();
        }
      }}
    >
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Withdrawing…" : "Withdraw request"}
        </Button>
      </div>
    </form>
  );
}

/** Focal point or admin: accept or decline a pending request. Final once sent. */
export function DecisionForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    decideMeetingRequestAction.bind(null, requestId),
    initial,
  );
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const verb =
          submitter?.getAttribute("value") === "ACCEPTED"
            ? "Accept"
            : "Decline";
        if (!window.confirm(`${verb} this request? This cannot be changed.`)) {
          event.preventDefault();
        }
      }}
    >
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="outcome"
          value="ACCEPTED"
          size="sm"
          disabled={pending}
        >
          Accept
        </Button>
        <Button
          type="submit"
          name="outcome"
          value="DECLINED"
          variant="destructive"
          size="sm"
          disabled={pending}
        >
          Decline
        </Button>
      </div>
    </form>
  );
}
