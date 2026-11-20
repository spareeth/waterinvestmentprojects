// F9: meeting times on requests, against real PostgreSQL. An investor chooses a time and the first free room is
// held for the request; accepting books it, declining or withdrawing frees it. Neither an investor nor a country
// can have two meetings at the same time, a full time is refused, and a refused request leaves nothing behind.
// Also: the attendee's name and email as typed on the request reach the emails, the inbox and the CSV.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MeetingRequestStatus,
  MembershipRole,
  ProjectStatus,
  SlotStatus,
  UserRole,
} from "@/generated/prisma/enums";
import type { Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { MemoryMailer } from "@/lib/mail";
import { uaeTime } from "@/lib/meetings/schedule";
import {
  ensureSchedule,
  getMeetingSchedule,
  listMeetingTimes,
} from "@/lib/meetings/slots";
import {
  createMeetingRequest,
  decideMeetingRequest,
  exportRequestsCsv,
  getRequestPanel,
  listInboxRequests,
  RequestError,
  type RequestOptions,
  withdrawMeetingRequest,
} from "@/lib/requests/service";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-mtg-a", b: "it-mtg-b", c: "it-mtg-c" } as const;
const P = {
  a1: "it-mtg-p-a1",
  a2: "it-mtg-p-a2",
  b1: "it-mtg-p-b1",
  c1: "it-mtg-p-c1",
} as const;
const T1 = uaeTime("2026-12-08", "09:00");
const T2 = uaeTime("2026-12-08", "09:30");
const NOW = new Date("2026-11-25T08:00:00Z");

type Key = "admin" | "focalA" | "i1" | "i2" | "i3";
const v = {} as Record<Key, Viewer>;

function opts(extra: Partial<RequestOptions> = {}): RequestOptions {
  return {
    now: NOW,
    mailer: new MemoryMailer(),
    notify: { focalPoints: false, investor: false },
    summitRecipients: ["summit-team@it.example"],
    ...extra,
  };
}

const input = (slotStartsAt: Date | null, name = "Ivy Attendee") => ({
  contactName: name,
  contactEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@it.example`,
  organisation: "Fictional Water Fund",
  role: "Investment director",
  note: "",
  slotStartsAt,
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RequestError) return error.code;
    throw error;
  }
  return "allowed";
}

async function slotOf(requestId: string) {
  return db.slot.findUnique({
    where: { meetingRequestId: requestId },
    select: { status: true, startsAt: true, room: { select: { name: true } } },
  });
}

async function available(viewer: Viewer, countryId: string, at: Date) {
  const days = await listMeetingTimes(viewer.id, countryId, NOW);
  return days.flatMap((d) => d.times).find((t) => t.value === at.toISOString())
    ?.available;
}

const R: Record<string, string> = {};

beforeAll(async () => {
  await cleanUp();
  await ensureSchedule();
  // Earlier runs (or a staging copy) may have left real requests on these two times: start from free slots.
  await db.slot.updateMany({
    where: { startsAt: { in: [T1, T2] } },
    data: { status: SlotStatus.OPEN, meetingRequestId: null },
  });
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Meetings A", iso3: "XMA" },
      { id: C.b, name: "IT Meetings B", iso3: "XMB" },
      { id: C.c, name: "IT Meetings C", iso3: "XMC" },
    ],
  });
  await db.project.createMany({
    data: [
      [P.a1, C.a],
      [P.a2, C.a],
      [P.b1, C.b],
      [P.c1, C.c],
    ].map(([id, countryId]) => ({
      id,
      countryId,
      title: `IT Meeting project ${id}`,
      sector: "Water supply",
      status: ProjectStatus.PUBLISHED,
      publishedAt: NOW,
    })),
  });
  const make = async (
    key: Key,
    role: UserRole,
    membershipRole?: MembershipRole,
    countryId?: string,
  ) => {
    const u = await createUser({
      role,
      membershipRole,
      countryId,
      termsAccepted: true,
      mfaEnabled: true,
    });
    v[key] = (await viewerFor(u.id))!;
  };
  await make("admin", UserRole.SUMMIT_ADMIN);
  await make("focalA", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  await make("i1", UserRole.INVESTOR);
  await make("i2", UserRole.INVESTOR);
  await make("i3", UserRole.INVESTOR);
});

afterAll(async () => {
  await cleanUp();
});

describe("choosing a meeting time", () => {
  it("offers the schedule's times on the request panel, with the account's name and email filled in", async () => {
    const panel = await getRequestPanel(v.i1, P.a1, { now: NOW });
    expect(panel?.times.map((d) => d.label)).toEqual([
      "Tuesday 8 December",
      "Wednesday 9 December",
    ]);
    expect(panel?.times[0].times[0]).toMatchObject({
      value: T1.toISOString(),
      label: "09:00",
      available: true,
    });
    expect(panel?.defaults.contactName).toBe("Integration Tester");
    expect(panel?.defaults.contactEmail).toMatch(/@it\.example$/);
  });

  it("holds the first free room for the request and names the time and attendee in the Summit notice", async () => {
    const mailer = new MemoryMailer();
    const { id } = await createMeetingRequest(
      v.i1,
      P.a1,
      input(T1),
      opts({ mailer }),
    );
    R.i1a1 = id;
    expect(await slotOf(id)).toMatchObject({
      status: SlotStatus.HELD,
      startsAt: T1,
      room: { name: "Room A" },
    });
    const row = await db.meetingRequest.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      contactName: "Ivy Attendee",
      contactEmail: "ivy.attendee@it.example",
    });
    expect(mailer.sent[0].text).toContain(
      "Proposed meeting: Tuesday 8 December, 09:00 to 09:30 (UAE time), Room A",
    );
    expect(mailer.sent[0].text).toContain(
      "Ivy Attendee <ivy.attendee@it.example>",
    );
  });

  it("marks a time unavailable for the same investor and for the same country", async () => {
    expect(await available(v.i1, C.b, T1)).toBe(false);
    expect(await available(v.i2, C.a, T1)).toBe(false);
    expect(await available(v.i2, C.b, T1)).toBe(true);
    expect(await available(v.i1, C.b, T2)).toBe(true);
  });

  it("refuses a clash and leaves no request behind", async () => {
    expect(
      await refusal(createMeetingRequest(v.i1, P.a2, input(T1), opts())),
    ).toBe("slot_taken");
    expect(
      await refusal(createMeetingRequest(v.i2, P.a2, input(T1), opts())),
    ).toBe("slot_taken");
    expect(await db.meetingRequest.count({ where: { projectId: P.a2 } })).toBe(
      0,
    );
  });

  it("gives the second room to another country's meeting, then refuses a full time", async () => {
    const { id } = await createMeetingRequest(
      v.i2,
      P.b1,
      input(T1, "Bo Attendee"),
      opts(),
    );
    R.i2b1 = id;
    expect((await slotOf(id))?.room.name).toBe("Room B");
    expect(await available(v.i3, C.c, T1)).toBe(false);
    expect(
      await refusal(createMeetingRequest(v.i3, P.c1, input(T1), opts())),
    ).toBe("slot_taken");
  });

  it("refuses a time in the past", async () => {
    const late = opts({ now: new Date(T2.getTime() + 60_000) });
    expect(
      await refusal(createMeetingRequest(v.i3, P.c1, input(T2), late)),
    ).toBe("slot_taken");
  });

  it("still takes a request without a time", async () => {
    const { id } = await createMeetingRequest(v.i3, P.a2, input(null), opts());
    expect(await slotOf(id)).toBeNull();
    await withdrawMeetingRequest(v.i3, id, opts());
  });
});

describe("answers free or book the time", () => {
  it("books the slot when the country accepts and tells the attendee the time", async () => {
    const mailer = new MemoryMailer();
    await decideMeetingRequest(
      v.focalA,
      R.i1a1,
      MeetingRequestStatus.ACCEPTED,
      opts({ mailer, notify: { focalPoints: false, investor: true } }),
    );
    expect((await slotOf(R.i1a1))?.status).toBe(SlotStatus.BOOKED);
    expect(mailer.sent[0].to).toEqual(["ivy.attendee@it.example"]);
    expect(mailer.sent[0].text).toContain(
      "Your meeting: Tuesday 8 December, 09:00 to 09:30 (UAE time), Room A.",
    );
  });

  it("frees the slot when the investor withdraws, so another investor can take it", async () => {
    await withdrawMeetingRequest(v.i2, R.i2b1, opts());
    expect(await slotOf(R.i2b1)).toBeNull();
    const { id } = await createMeetingRequest(
      v.i3,
      P.c1,
      input(T1, "Cy Attendee"),
      opts(),
    );
    R.i3c1 = id;
    expect((await slotOf(id))?.room.name).toBe("Room B");
  });

  it("frees the slot when the country declines", async () => {
    await decideMeetingRequest(
      v.admin,
      R.i3c1,
      MeetingRequestStatus.DECLINED,
      opts(),
    );
    expect(await slotOf(R.i3c1)).toBeNull();
    expect(await available(v.i3, C.c, T1)).toBe(true);
  });
});

describe("showing the meetings", () => {
  it("shows the attendee and the time in the inbox and the CSV", async () => {
    const rows = await listInboxRequests(v.focalA, {}, opts());
    const row = rows.find((r) => r.id === R.i1a1)!;
    expect(row.contactName).toBe("Ivy Attendee");
    expect(row.slot?.room.name).toBe("Room A");
    const { csv } = await exportRequestsCsv(v.focalA, {}, opts());
    expect(csv).toContain("2026-12-08 09:00");
    expect(csv).toContain("Room A");
    expect(csv).toContain("ivy.attendee@it.example");
  });

  it("gives admins the room grid and nobody else", async () => {
    const days = await getMeetingSchedule(v.admin);
    const day = days.find((d) => d.key === "2026-12-08")!;
    expect(day.rooms.map((r) => r.name)).toEqual(["Room A", "Room B"]);
    expect(day.rows).toHaveLength(16);
    const nine = day.rows[0];
    expect(nine.label).toBe("09:00 to 09:30");
    expect(nine.cells[0]?.meetingRequest?.id).toBe(R.i1a1);
    expect(nine.cells[1]?.meetingRequest).toBeNull();
    expect(await getMeetingSchedule(v.focalA)).toEqual([]);
    expect(await getMeetingSchedule(v.i1)).toEqual([]);
  });
});
