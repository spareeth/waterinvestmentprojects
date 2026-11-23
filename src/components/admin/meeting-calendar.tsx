"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  blockSlotAction,
  blockTimesAction,
  type CalendarActionState,
  cancelMeetingAction,
  unblockSlotAction,
} from "@/app/(portal)/admin/meetings/actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "@/components/workspace/form-controls";

// Admin master calendar controls (23 Nov). Like the other admin forms, they call their server actions from a
// handler (not useActionState). Every action is checked again on the server (src/lib/authz).

function Outcome({ state }: { state: CalendarActionState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return null;
}

/** "Block times": a range of one day, in one room or all of them, with an optional reason. */
export function BlockTimesForm({
  day,
  dayLabel,
  times,
  rooms,
}: {
  /** YYYY-MM-DD of the day shown. */
  day: string;
  dayLabel: string;
  /** "HH:MM" start times of the day, plus its end time last. */
  times: string[];
  rooms: { id: string; name: string }[];
}) {
  const [state, setState] = useState<CalendarActionState>({});
  const [pending, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => setState(await blockTimesAction(data)));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      aria-label={`Block times on ${dayLabel}`}
    >
      <p className="text-sm font-semibold text-brand-navy">
        Block times on {dayLabel}
      </p>
      <input type="hidden" name="date" value={day} />
      <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)]">
        <FieldShell id="block-from" label="From" error={errors.from}>
          <Select
            {...describe("block-from", undefined, errors.from)}
            name="from"
            defaultValue={times[0]}
          >
            {times.slice(0, -1).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id="block-to" label="Until" error={errors.to}>
          <Select
            {...describe("block-to", undefined, errors.to)}
            name="to"
            defaultValue={times.at(-1)}
          >
            {times.slice(1).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id="block-room" label="Room" error={errors.roomId}>
          <Select
            {...describe("block-room", undefined, errors.roomId)}
            name="roomId"
            defaultValue=""
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell
          id="block-reason"
          label="Reason (optional)"
          error={errors.reason}
        >
          <TextInput
            {...describe("block-reason", undefined, errors.reason)}
            name="reason"
            placeholder="For example: Summit plenary"
            maxLength={200}
          />
        </FieldShell>
      </div>
      <p className="text-xs text-muted-foreground">
        Only free times are blocked. Times a meeting holds stay as they are:
        cancel the meeting first. Investors see blocked times as not available.
      </p>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Blocking…" : "Block these times"}
        </Button>
      </div>
      <Outcome state={state} />
    </form>
  );
}

/** The buttons on one calendar cell: Block (free), Unblock (blocked) or Cancel meeting (held or booked). */
export function SlotActions({
  slotId,
  requestId,
  blocked,
  meetingLabel,
}: {
  slotId: string;
  /** The request holding the slot, if any. */
  requestId: string | null;
  blocked: boolean;
  /** "Country: Project, with Name (Organisation), Tuesday 8 December 09:00, Room 1 - Al Jimi" for the prompt. */
  meetingLabel: string;
}) {
  const [state, setState] = useState<CalendarActionState>({});
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<CalendarActionState>) {
    startTransition(async () => setState(await action()));
  }

  let button;
  if (requestId) {
    button = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(
            `Cancel this meeting?\n\n${meetingLabel}\n\nThe investor, the country and the Summit mailbox are told, and the time becomes free. Reason (optional, included in the emails):`,
            "",
          );
          if (reason === null) return;
          run(() => cancelMeetingAction(requestId, reason));
        }}
      >
        {pending ? "Cancelling…" : "Cancel meeting"}
      </Button>
    );
  } else if (blocked) {
    button = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => unblockSlotAction(slotId))}
      >
        {pending ? "Unblocking…" : "Unblock"}
      </Button>
    );
  } else {
    button = (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(
            `Block this time?\n\n${meetingLabel}\n\nReason (optional, shown only to the Summit team):`,
            "",
          );
          if (reason === null) return;
          run(() => blockSlotAction(slotId, reason));
        }}
      >
        {pending ? "Blocking…" : "Block"}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div>{button}</div>
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
