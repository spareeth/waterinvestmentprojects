// Admin master calendar (23 Nov), against real PostgreSQL: admins block free times (investors are never offered
// them and cannot take them), unblock them, and cancel meetings (the slot is freed and the investor, the country
// and the Summit mailbox are told). Only admins: country users (own country or not), coordinators and investors
// are refused everything, and a country never reaches another country's request.

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
import {
  blockSlot,
  blockTimes,
  SLOT_AUDIT,
  ScheduleError,
  unblockSlot,
} from "@/lib/meetings/manage";
import { MEETING_ROOMS, roomSlotValue, uaeTime } from "@/lib/meetings/schedule";
import {
  ensureSchedule,
  getMeetingSchedule,
  listRoomTimes,
} from "@/lib/meetings/slots";
import {
  cancelMeetingRequest,
  createMeetingRequest,
  decideMeetingRequest,
  REQUEST_AUDIT,
  RequestError,
  type RequestOptions,
} from "@/lib/requests/service";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-cal-a", b: "it-cal-b" } as const;
const P = { a: "it-cal-p-a", b: "it-cal-p-b" } as const;
const DAY = "2026-12-09";
const B1 = uaeTime(DAY, "11:00");
const B2 = uaeTime(DAY, "11:30");
const M1 = uaeTime(DAY, "14:00");
const M2 = uaeTime(DAY, "14:30");
const ALL = [B1, B2, M1, M2];
const NOW = new Date("2026-11-25T08:00:00Z");
const ROOM1 = MEETING_ROOMS[0].name;
const ROOM2 = MEETING_ROOMS[1].name;

type Key = "admin" | "focalA" | "focalB" | "coordA" | "i1" | "i2";
const v = {} as Record<Key, Viewer>;
const R: Record<string, string> = {};

function opts(extra: Partial<RequestOptions> = {}): RequestOptions {
  return {
    now: NOW,
    mailer: new MemoryMailer(),
    notify: { focalPoints: false, investor: false },
    summitRecipients: ["summit-team@it.example"],
    ...extra,
  };
}

const input = (at: Date, room: string | null, name: string) => ({
  contactName: name,
  contactEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@it.example`,
  organisation: "Fictional Calendar Fund",
  role: "Partner",
  note: "",
  slotStartsAt: at,
  slotRoom: room,
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RequestError || error instanceof ScheduleError) {
      return error.code;
    }
    throw error;
  }
  return "allowed";
}

async function slotAt(at: Date, room: string) {
  return db.slot.findFirstOrThrow({
    where: { startsAt: at, room: { name: room } },
    select: {
      id: true,
      status: true,
      blockedReason: true,
      meetingRequestId: true,
    },
  });
}

async function stateFor(
  viewer: Viewer,
  countryId: string,
  at: Date,
  room: string,
) {
  const rooms = await listRoomTimes(viewer.id, countryId, NOW);
  return rooms
    .find((r) => r.room === room)
    ?.days.flatMap((d) => d.times)
    .find((t) => t.value === roomSlotValue(at, room))?.state;
}

async function freeTestTimes() {
  await db.slot.updateMany({
    where: { startsAt: { in: ALL } },
    data: {
      status: SlotStatus.OPEN,
      meetingRequestId: null,
      blockedReason: null,
    },
  });
}

beforeAll(async () => {
  await cleanUp();
  await ensureSchedule();
  // Earlier runs (or a staging copy) may have left requests or blocks on these times: start from free slots.
  await freeTestTimes();
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Calendar A", iso3: "XCA" },
      { id: C.b, name: "IT Calendar B", iso3: "XCB" },
    ],
  });
  await db.project.createMany({
    data: [
      [P.a, C.a],
      [P.b, C.b],
    ].map(([id, countryId]) => ({
      id,
      countryId,
      title: `IT Calendar project ${id}`,
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
    return u;
  };
  await make("admin", UserRole.SUMMIT_ADMIN);
  const focalA = await make(
    "focalA",
    UserRole.COUNTRY,
    MembershipRole.FOCAL_POINT,
    C.a,
  );
  await make("focalB", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  await make("coordA", UserRole.WBG_COORDINATOR, MembershipRole.MEMBER, C.a);
  await make("i1", UserRole.INVESTOR);
  await make("i2", UserRole.INVESTOR);
  await db.countryContact.create({
    data: {
      countryId: C.a,
      name: "Calendar Focal",
      email: focalA.email,
      role: "FOCAL_POINT",
      userId: focalA.id,
    },
  });
});

afterAll(async () => {
  await freeTestTimes();
  await cleanUp();
});

describe("blocking times", () => {
  it("blocks a range of free times in every room, audits each one and never offers them to investors", async () => {
    const result = await blockTimes(v.admin, {
      date: DAY,
      from: "11:00",
      to: "12:00",
      roomId: null,
      reason: "IT plenary",
    });
    expect(result).toEqual({ blocked: 4, skipped: 0 });
    const slot = await slotAt(B1, ROOM1);
    expect(slot).toMatchObject({
      status: SlotStatus.BLOCKED,
      blockedReason: "IT plenary",
    });
    expect(
      await db.auditEvent.count({
        where: { action: SLOT_AUDIT.BLOCK, actorId: v.admin.id },
      }),
    ).toBe(4);

    // Investors see the times as not available and cannot take them, by room or by time alone.
    expect(await stateFor(v.i1, C.a, B1, ROOM1)).toBe("unavailable");
    expect(await stateFor(v.i1, C.a, B2, ROOM2)).toBe("unavailable");
    expect(
      await refusal(
        createMeetingRequest(
          v.i1,
          P.a,
          input(B1, ROOM1, "Ivy Blocked"),
          opts(),
        ),
      ),
    ).toBe("slot_taken");
    expect(
      await refusal(
        createMeetingRequest(v.i1, P.a, input(B2, null, "Ivy Blocked"), opts()),
      ),
    ).toBe("slot_taken");
    expect(await db.meetingRequest.count({ where: { projectId: P.a } })).toBe(
      0,
    );

    // The admin calendar shows the block and its reason.
    const day = (await getMeetingSchedule(v.admin)).find((d) => d.key === DAY)!;
    const row = day.rows.find((r) => r.startsAt.getTime() === B1.getTime())!;
    expect(row.cells.map((c) => c?.status)).toEqual([
      SlotStatus.BLOCKED,
      SlotStatus.BLOCKED,
    ]);
    expect(row.cells[0]?.blockedReason).toBe("IT plenary");
    expect(day.blocked).toBeGreaterThanOrEqual(4);
  });

  it("unblocks a time, which investors can then choose again", async () => {
    const slot = await slotAt(B1, ROOM1);
    await unblockSlot(v.admin, slot.id);
    expect(await slotAt(B1, ROOM1)).toMatchObject({
      status: SlotStatus.OPEN,
      blockedReason: null,
    });
    expect(await stateFor(v.i1, C.a, B1, ROOM1)).toBe("free");
    expect(
      await db.auditEvent.count({
        where: { action: SLOT_AUDIT.UNBLOCK, entityId: slot.id },
      }),
    ).toBe(1);
    // Unblocking a free slot, or blocking a blocked one, is refused.
    expect(await refusal(unblockSlot(v.admin, slot.id))).toBe("not_found");
    const still = await slotAt(B1, ROOM2);
    expect(await refusal(blockSlot(v.admin, still.id, ""))).toBe("not_found");
  });

  it("leaves a time that a request holds as it is", async () => {
    const { id } = await createMeetingRequest(
      v.i1,
      P.a,
      input(M1, ROOM1, "Ivy Held"),
      opts(),
    );
    R.held = id;
    const result = await blockTimes(v.admin, {
      date: DAY,
      from: "14:00",
      to: "14:30",
      roomId: null,
      reason: "",
    });
    expect(result).toEqual({ blocked: 1, skipped: 1 });
    expect(await slotAt(M1, ROOM1)).toMatchObject({
      status: SlotStatus.HELD,
      meetingRequestId: id,
    });
    expect((await slotAt(M1, ROOM2)).status).toBe(SlotStatus.BLOCKED);
    const free = await slotAt(M1, ROOM2);
    await unblockSlot(v.admin, free.id);
  });

  it("checks the range", async () => {
    expect(
      await refusal(
        blockTimes(v.admin, {
          date: DAY,
          from: "12:00",
          to: "11:00",
          roomId: null,
          reason: "",
        }),
      ),
    ).toBe("invalid");
    expect(
      await refusal(
        blockTimes(v.admin, {
          date: "2026-12-11",
          from: "09:00",
          to: "10:00",
          roomId: null,
          reason: "",
        }),
      ),
    ).toBe("invalid");
  });
});

describe("only admins manage the calendar", () => {
  it("refuses blocking, unblocking and cancelling to country users, coordinators and investors", async () => {
    const blocked = await slotAt(B2, ROOM1);
    const free = await slotAt(B1, ROOM1);
    for (const key of ["focalA", "focalB", "coordA", "i1", "i2"] as const) {
      const who = v[key];
      expect(
        await refusal(
          blockTimes(who, {
            date: DAY,
            from: "11:00",
            to: "12:00",
            roomId: null,
            reason: "",
          }),
        ),
        key,
      ).toBe("forbidden");
      expect(await refusal(blockSlot(who, free.id, "")), key).toBe("forbidden");
      expect(await refusal(unblockSlot(who, blocked.id)), key).toBe(
        "forbidden",
      );
      // The country's own focal point and coordinator are refused; another country does not even find it.
      expect(
        await refusal(cancelMeetingRequest(who, R.held, "", opts())),
        key,
      ).toMatch(/^(forbidden|not_found)$/);
      expect(await getMeetingSchedule(who), key).toEqual([]);
    }
    expect(
      await refusal(cancelMeetingRequest(v.focalB, R.held, "", opts())),
    ).toBe("not_found");
    expect((await slotAt(B2, ROOM1)).status).toBe(SlotStatus.BLOCKED);
    expect((await slotAt(B1, ROOM1)).status).toBe(SlotStatus.OPEN);
    expect(
      (await db.meetingRequest.findUniqueOrThrow({ where: { id: R.held } }))
        .status,
    ).toBe(MeetingRequestStatus.PENDING);
  });
});

describe("cancelling meetings", () => {
  it("cancels a request awaiting the country: the slot is freed and everyone is told", async () => {
    const mailer = new MemoryMailer();
    await cancelMeetingRequest(
      v.admin,
      R.held,
      "Room needed for the plenary",
      opts({ mailer }),
    );
    const row = await db.meetingRequest.findUniqueOrThrow({
      where: { id: R.held },
    });
    expect(row.status).toBe(MeetingRequestStatus.CANCELLED);
    expect(await slotAt(M1, ROOM1)).toMatchObject({
      status: SlotStatus.OPEN,
      meetingRequestId: null,
    });
    const to = mailer.sent.map((m) => m.to);
    expect(to).toContainEqual(["ivy.held@it.example"]);
    expect(to).toContainEqual(["summit-team@it.example"]);
    expect(mailer.sent).toHaveLength(3);
    const investorMail = mailer.sent.find((m) =>
      m.to.includes("ivy.held@it.example"),
    )!;
    expect(investorMail.text).toContain(
      "Reason given: Room needed for the plenary",
    );
    expect(investorMail.text).not.toContain("—");
    expect(
      await db.auditEvent.count({
        where: { action: REQUEST_AUDIT.CANCEL, entityId: R.held },
      }),
    ).toBe(1);
    // A second cancel is refused, and the investor may request the project again.
    expect(
      await refusal(cancelMeetingRequest(v.admin, R.held, "", opts())),
    ).toBe("not_open");
    const again = await createMeetingRequest(
      v.i1,
      P.a,
      input(M1, ROOM1, "Ivy Again"),
      opts(),
    );
    await cancelMeetingRequest(v.admin, again.id, "", opts());
  });

  it("cancels a confirmed meeting and frees its time", async () => {
    const { id } = await createMeetingRequest(
      v.i2,
      P.a,
      input(M2, ROOM2, "Bo Confirmed"),
      opts(),
    );
    await decideMeetingRequest(
      v.focalA,
      id,
      MeetingRequestStatus.ACCEPTED,
      opts(),
    );
    expect((await slotAt(M2, ROOM2)).status).toBe(SlotStatus.BOOKED);
    const mailer = new MemoryMailer();
    await cancelMeetingRequest(v.admin, id, "", opts({ mailer }));
    expect(
      (await db.meetingRequest.findUniqueOrThrow({ where: { id } })).status,
    ).toBe(MeetingRequestStatus.CANCELLED);
    expect((await slotAt(M2, ROOM2)).status).toBe(SlotStatus.OPEN);
    const investorMail = mailer.sent.find((m) =>
      m.to.includes("bo.confirmed@it.example"),
    )!;
    expect(investorMail.text).toContain(
      "cancelled your confirmed bilateral meeting",
    );
    expect(investorMail.text).not.toContain("Reason given");
    expect(await stateFor(v.i1, C.a, M2, ROOM2)).toBe("free");
  });
});
