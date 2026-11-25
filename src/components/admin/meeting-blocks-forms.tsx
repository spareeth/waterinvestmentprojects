"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  type CalendarActionState,
  importBlocksAction,
  setCounterpartsAction,
} from "@/app/(portal)/admin/meetings/actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Textarea,
} from "@/components/workspace/form-controls";

// Admin: load the countries' time blocks and edit their counterparts (25 Nov). Handler-based like the other admin
// forms; the server checks the permission again (canManageMeetingBlocks).

function Outcome({ state }: { state: CalendarActionState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return null;
}

export function BlocksImportForm({ rooms }: { rooms: readonly string[] }) {
  const [state, setState] = useState<CalendarActionState>({});
  const [pending, startTransition] = useTransition();
  const hint = `One block per line: ISO3, date, from, to, room. For example JOR, 2026-12-08, 09:00, 12:00, 1. Times are UAE time; rooms: ${rooms.map((r, i) => `${i + 1} = ${r}`).join("; ")}. The countries named here get exactly these blocks; other countries keep theirs.`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => setState(await importBlocksAction(data)));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <FieldShell
        id="blocks-text"
        label="Load time blocks"
        hint={hint}
        error={state.fieldErrors?.blocks}
      >
        <Textarea
          {...describe("blocks-text", hint, state.fieldErrors?.blocks)}
          name="blocks"
          rows={8}
          className="font-mono text-xs"
          placeholder="JOR, 2026-12-08, 09:00, 12:00, 1"
        />
      </FieldShell>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save these blocks"}
        </Button>
      </div>
      <Outcome state={state} />
    </form>
  );
}

export function CounterpartsForm({
  countryId,
  countryName,
  initial,
}: {
  countryId: string;
  countryName: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<CalendarActionState>({});
  const [pending, startTransition] = useTransition();
  const id = `counterparts-${countryId}`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () =>
          setState(await setCounterpartsAction(countryId, value)),
        );
      }}
      className="flex flex-col gap-2"
      noValidate
    >
      <FieldShell
        id={id}
        label={`Government counterparts for ${countryName}`}
        hint="One person per line: name, title and organisation. Shown on the country's project pages."
        error={state.fieldErrors?.counterparts}
      >
        <Textarea
          {...describe(
            id,
            "One person per line",
            state.fieldErrors?.counterparts,
          )}
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </FieldShell>
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save counterparts"}
        </Button>
      </div>
      <Outcome state={state} />
    </form>
  );
}
