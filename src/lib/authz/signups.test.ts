// @vitest-environment node
// 25 Nov: meeting sign-up permissions and the pure schedule helpers. The Postgres side (exact visible sets,
// cross-country and cross-investor isolation, audit) is in tests/integration/meeting-signups.test.ts.

import { describe, expect, it } from "vitest";
import {
  CountryStatus,
  MembershipRole,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import {
  blockSlotStarts,
  formatSignupSlot,
  signupDeadlinePassed,
  uaeTime,
} from "@/lib/meetings/schedule";
import {
  canManageMeetingBlocks,
  canSignUpForMeetings,
  canViewSignupList,
  canWithdrawSignup,
  meetingSignupWhere,
  NO_SIGNUP,
} from "./signups";
import type { Viewer } from "./viewer";

function viewer(id: string, role: UserRole, countries: string[] = []): Viewer {
  return {
    id,
    role,
    memberships: countries.map((countryId) => ({
      countryId,
      role: MembershipRole.FOCAL_POINT,
    })),
  };
}

const admin = viewer("sa", UserRole.SUMMIT_ADMIN);
const focalA = viewer("fa", UserRole.COUNTRY, ["a"]);
const coordA = viewer("ca", UserRole.WBG_COORDINATOR, ["a"]);
const investor = viewer("i", UserRole.INVESTOR);
const investorStray = viewer("is", UserRole.INVESTOR, ["a"]);

const published = {
  countryId: "a",
  status: ProjectStatus.PUBLISHED,
  country: { status: CountryStatus.ACTIVE },
};

describe("meeting sign-up permissions", () => {
  it("shows each role only its own sign-ups", () => {
    expect(meetingSignupWhere(admin)).toEqual({});
    expect(meetingSignupWhere(investor)).toEqual({ requesterId: "i" });
    // A stray membership never widens an investor's view.
    expect(meetingSignupWhere(investorStray)).toEqual({ requesterId: "is" });
    expect(meetingSignupWhere(focalA)).toEqual({ countryId: { in: ["a"] } });
    expect(meetingSignupWhere(coordA)).toEqual({ countryId: { in: ["a"] } });
    expect(meetingSignupWhere(viewer("cn", UserRole.COUNTRY))).toEqual(
      NO_SIGNUP,
    );
    expect(meetingSignupWhere(null)).toEqual(NO_SIGNUP);
  });

  it("lets only investors sign up, on projects in the pipeline, before the deadline", () => {
    expect(canSignUpForMeetings(investor, published, false)).toBe(true);
    expect(canSignUpForMeetings(investor, published, true)).toBe(false);
    expect(
      canSignUpForMeetings(
        investor,
        { ...published, status: ProjectStatus.DRAFT },
        false,
      ),
    ).toBe(false);
    expect(
      canSignUpForMeetings(
        investor,
        { ...published, country: { status: CountryStatus.INACTIVE } },
        false,
      ),
    ).toBe(false);
    for (const v of [admin, focalA, coordA, null]) {
      expect(canSignUpForMeetings(v, published, false)).toBe(false);
    }
  });

  it("lets only the investor withdraw their own active sign-up, before the deadline", () => {
    const mine = { requesterId: "i", status: "ACTIVE" as const };
    expect(canWithdrawSignup(investor, mine, false)).toBe(true);
    expect(canWithdrawSignup(investor, mine, true)).toBe(false);
    expect(
      canWithdrawSignup(investor, { ...mine, status: "WITHDRAWN" }, false),
    ).toBe(false);
    for (const v of [admin, focalA, investorStray]) {
      expect(canWithdrawSignup(v, mine, false)).toBe(false);
    }
  });

  it("gives the list to admins, countries and coordinators, and the blocks to admins", () => {
    expect(canViewSignupList(admin)).toBe(true);
    expect(canViewSignupList(focalA)).toBe(true);
    expect(canViewSignupList(coordA)).toBe(true);
    expect(canViewSignupList(investor)).toBe(false);
    expect(canViewSignupList(null)).toBe(false);
    expect(canManageMeetingBlocks(admin)).toBe(true);
    for (const v of [focalA, coordA, investor, null]) {
      expect(canManageMeetingBlocks(v)).toBe(false);
    }
  });
});

describe("sign-up times", () => {
  it("offers a 30-minute start inside each block, shown as a 20-minute meeting", () => {
    const starts = blockSlotStarts([
      {
        startsAt: uaeTime("2026-12-08", "09:00"),
        endsAt: uaeTime("2026-12-08", "10:30"),
      },
      // Overlapping and out of order: no duplicates, sorted.
      {
        startsAt: uaeTime("2026-12-08", "10:00"),
        endsAt: uaeTime("2026-12-08", "11:00"),
      },
    ]);
    expect(starts.map(formatSignupSlot)).toEqual([
      "09:00–09:20",
      "09:30–09:50",
      "10:00–10:20",
      "10:30–10:50",
    ]);
    // A block shorter than 30 minutes offers nothing.
    expect(
      blockSlotStarts([
        {
          startsAt: uaeTime("2026-12-09", "09:00"),
          endsAt: uaeTime("2026-12-09", "09:20"),
        },
      ]),
    ).toEqual([]);
  });

  it("closes sign-ups after the end of 1 December, UAE time", () => {
    expect(signupDeadlinePassed(new Date("2026-12-01T19:59:00Z"))).toBe(false);
    expect(signupDeadlinePassed(new Date("2026-12-01T20:00:00Z"))).toBe(true);
  });
});
