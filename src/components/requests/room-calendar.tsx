"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";
import type { RoomSlotState, RoomTimes } from "@/lib/meetings/schedule";

// The meeting calendar, one tab per room (22 Nov, user request): every 30-minute slot of the room with its state,
// and a legend. Who holds a slot is never shown. Plain radio buttons inside the tabs (all tabs stay in the form,
// hidden ones too), so a choice survives switching tabs and the form also works with the keyboard.

const STATE_LABEL: Record<RoomSlotState, string> = {
  free: "Free",
  pending: "Requested, awaiting an answer",
  booked: "Booked",
  yours: "Your meeting",
  unavailable: "Not available for you",
};

const STATE_CLASS: Record<RoomSlotState, string> = {
  free: "cursor-pointer border-water-200 bg-card text-water-800 hover:border-water-500 has-checked:border-water-700 has-checked:bg-water-700 has-checked:text-white has-focus-visible:ring-3 has-focus-visible:ring-brand-aqua/60",
  pending:
    "cursor-not-allowed border-pending-foreground/30 bg-pending text-pending-foreground",
  booked: "cursor-not-allowed border-brand-navy bg-brand-navy text-white",
  yours:
    "cursor-default border-brand-teal bg-brand-teal/15 font-semibold text-brand-navy ring-2 ring-brand-teal",
  unavailable:
    "cursor-not-allowed border-dashed border-water-100 text-muted-foreground line-through",
};

/** The legend swatches: the same colours as the slots. */
const SWATCH_CLASS: Record<RoomSlotState, string> = {
  free: "border-water-200 bg-card",
  pending: "border-pending-foreground/30 bg-pending",
  booked: "border-brand-navy bg-brand-navy",
  yours: "border-brand-teal bg-brand-teal/15 ring-2 ring-brand-teal",
  unavailable: "border-dashed border-water-200",
};

function Swatch({ state }: { state: RoomSlotState }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-6 rounded border ${SWATCH_CLASS[state]}`}
    />
  );
}

export function RoomCalendar({
  rooms,
  selected = "",
  error,
  readOnly = false,
}: {
  rooms: RoomTimes[];
  /** The chosen value ("ISO|Room"), kept when a refused form comes back. */
  selected?: string;
  error?: string;
  /** Show only (the investor already has an open request): no choosing. */
  readOnly?: boolean;
}) {
  const base = useId();
  const firstWithChoice = Math.max(
    0,
    rooms.findIndex((r) =>
      r.days.some((d) =>
        d.times.some((t) =>
          readOnly ? t.state === "yours" : t.value === selected,
        ),
      ),
    ),
  );
  const [active, setActive] = useState(firstWithChoice);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  if (rooms.length === 0) return null;
  const shown = new Set(
    rooms.flatMap((r) => r.days.flatMap((d) => d.times.map((t) => t.state))),
  );
  const legend: RoomSlotState[] = (
    ["free", "pending", "booked", "yours", "unavailable"] as const
  ).filter((s) => s === "free" || shown.has(s));

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + rooms.length) % rooms.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <fieldset
      className="flex flex-col gap-3 rounded-xl border border-water-100 bg-water-50 p-4"
      aria-describedby={error ? `${base}-error` : `${base}-hint`}
    >
      <legend className="float-left mb-1 w-full text-sm font-semibold text-brand-navy">
        {readOnly ? "Meeting rooms" : "Meeting time"}
      </legend>
      <p id={`${base}-hint`} className="text-xs text-muted-foreground">
        30-minute bilateral meetings, UAE time.{" "}
        {readOnly
          ? "Your meeting is highlighted."
          : "Choose a room, then a free time. The time is held for you until the country answers."}
      </p>
      {error ? (
        <p
          id={`${base}-error`}
          className="text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Meeting rooms"
        className="flex gap-1 border-b border-water-200"
      >
        {rooms.map((r, i) => (
          <button
            key={r.room}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(event) => onTabKey(event, i)}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none ${
              i === active
                ? "border-water-200 border-b-water-50 bg-water-50 text-brand-navy"
                : "border-transparent text-muted-foreground hover:text-brand-navy"
            }`}
          >
            {r.room}
          </button>
        ))}
      </div>

      <ul
        aria-label="Legend"
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        {legend.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <Swatch state={s} />
            {STATE_LABEL[s]}
          </li>
        ))}
        {readOnly ? null : (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-4 w-6 rounded border border-water-700 bg-water-700"
            />
            Your choice
          </li>
        )}
      </ul>

      {rooms.map((r, i) => (
        <div
          key={r.room}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          hidden={i !== active}
          className="flex flex-col gap-3"
        >
          {r.capacity ? (
            <p className="text-xs text-muted-foreground">
              {r.room} seats up to {r.capacity} people.
            </p>
          ) : null}
          {r.days.map((day) => (
            <div
              key={day.key}
              role={readOnly ? "group" : "radiogroup"}
              aria-label={`${r.room}, ${day.label}`}
              className="flex flex-col gap-2"
            >
              <p className="text-sm font-medium">{day.label}</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
                {day.times.map((t) => {
                  const choosable = !readOnly && t.state === "free";
                  return (
                    <label
                      key={t.value}
                      className={`rounded-lg border px-2 py-1.5 text-center text-sm font-medium ${STATE_CLASS[t.state]}`}
                      title={
                        t.state === "free" ? undefined : STATE_LABEL[t.state]
                      }
                    >
                      {choosable ? (
                        <input
                          type="radio"
                          name="slot"
                          value={t.value}
                          defaultChecked={t.value === selected}
                          className="sr-only"
                        />
                      ) : null}
                      {t.label}
                      {t.state === "free" ? null : (
                        <span className="sr-only">
                          {" "}
                          ({STATE_LABEL[t.state]})
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
