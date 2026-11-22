import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoomTimes } from "@/lib/meetings/schedule";
import { RoomCalendar } from "./room-calendar";

const day = (room: string, states: string[]) => ({
  key: "2026-12-08",
  label: "Tuesday 8 December",
  times: states.map((state, i) => ({
    value: `2026-12-08T0${5 + i}:00:00.000Z|${room}`,
    label: `0${9 + i}:00`,
    state: state as RoomTimes["days"][number]["times"][number]["state"],
  })),
});

const ROOMS: RoomTimes[] = [
  { room: "Room A", days: [day("Room A", ["free", "booked", "pending"])] },
  { room: "Room B", days: [day("Room B", ["unavailable", "free", "free"])] },
];

describe("RoomCalendar", () => {
  it("shows one tab per room, with a legend, and only free slots can be chosen", () => {
    render(<RoomCalendar rooms={ROOMS} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Room A", "Room B"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    const legend = screen.getByRole("list", { name: "Legend" });
    for (const label of [
      "Free",
      "Booked",
      "Requested, awaiting an answer",
      "Not available for you",
      "Your choice",
    ]) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
    const roomA = screen.getByRole("tabpanel", { name: "Room A" });
    expect(within(roomA).getAllByRole("radio")).toHaveLength(1);
    expect(within(roomA).getByText("(Booked)")).toBeInTheDocument();
  });

  it("switches rooms and keeps a choice made in the other tab", () => {
    render(<RoomCalendar rooms={ROOMS} />);
    fireEvent.click(screen.getByRole("radio", { name: "09:00" }));
    fireEvent.click(screen.getByRole("tab", { name: "Room B" }));
    expect(screen.getByRole("tab", { name: "Room B" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const roomB = screen.getByRole("tabpanel", { name: "Room B" });
    expect(within(roomB).getAllByRole("radio")).toHaveLength(2);
    // The hidden Room A radio is still checked, so the form still sends it.
    const all = document.querySelectorAll<HTMLInputElement>(
      'input[name="slot"]:checked',
    );
    expect(all).toHaveLength(1);
    expect(all[0].value).toContain("|Room A");
  });

  it("shows the investor's own meeting without radios when read-only", () => {
    render(
      <RoomCalendar
        rooms={[{ room: "Room A", days: [day("Room A", ["yours", "free"])] }]}
        readOnly
      />,
    );
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("(Your meeting)")).toBeInTheDocument();
  });
});
