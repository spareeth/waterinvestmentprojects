// 25 Nov (WBG): meeting sign-ups by country, against real PostgreSQL. An investor signs up once per country from
// any of its published projects, ticking times inside the country's blocks (never outside them) and the projects
// of interest (never another country's, never a draft). Sign-ups never block other investors. Countries and their
// coordinators see their own countries' sign-ups only, investors their own only; only admins load blocks and
// counterparts. Nothing changes after the deadline. Every change is audited.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MembershipRole,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import type { Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { uaeTime } from "@/lib/meetings/schedule";
import {
  exportSignupsCsv,
  getProjectCounterparts,
  getSignupPanel,
  importMeetingBlocks,
  listCountrySignups,
  listMySignups,
  saveSignup,
  setCountryCounterparts,
  SIGNUP_AUDIT,
  SignupError,
  type SignupInput,
  withdrawSignup,
} from "@/lib/meetings/signups";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-su-a", b: "it-su-b" } as const;
const P = {
  a1: "it-su-p-a1",
  a2: "it-su-p-a2",
  aDraft: "it-su-p-a3",
  b1: "it-su-p-b1",
} as const;
const A1 = uaeTime("2026-12-08", "09:00");
const A2 = uaeTime("2026-12-08", "09:30");
const B1 = uaeTime("2026-12-09", "12:00");
const BEFORE = new Date("2026-11-25T08:00:00Z");
const AFTER = new Date("2026-12-02T08:00:00Z");

type Key = "admin" | "focalA" | "focalB" | "coordA" | "i1" | "i2";
const v = {} as Record<Key, Viewer>;
const R: Record<string, string> = {};

const values = (
  slots: Date[],
  projects: string[] = [],
  name = "Ivy Investor",
): SignupInput => ({
  contactName: name,
  contactEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@it.example`,
  organisation: "Fictional Fund",
  role: "Partner",
  note: "",
  slotStarts: slots.map((d) => d.toISOString()),
  projectIds: projects,
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SignupError) {
      return error.code === "invalid"
        ? `invalid:${Object.keys(error.fieldErrors).sort().join(",")}`
        : error.code;
    }
    throw error;
  }
  return "allowed";
}

beforeAll(async () => {
  await cleanUp();
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Signup A", iso3: "XSA" },
      { id: C.b, name: "IT Signup B", iso3: "XSB" },
    ],
  });
  await db.project.createMany({
    data: [
      [P.a1, C.a, ProjectStatus.PUBLISHED],
      [P.a2, C.a, ProjectStatus.PUBLISHED],
      [P.aDraft, C.a, ProjectStatus.DRAFT],
      [P.b1, C.b, ProjectStatus.PUBLISHED],
    ].map(([id, countryId, status]) => ({
      id,
      countryId,
      status: status as ProjectStatus,
      title: `IT Signup project ${id}`,
      sector: "Water supply",
      publishedAt: status === ProjectStatus.PUBLISHED ? BEFORE : null,
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
  await make("focalB", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  await make("coordA", UserRole.WBG_COORDINATOR, MembershipRole.MEMBER, C.a);
  await make("i1", UserRole.INVESTOR);
  await make("i2", UserRole.INVESTOR);
});

afterAll(async () => {
  await cleanUp();
});

describe("loading blocks and counterparts", () => {
  it("lets only admins load time blocks, by ISO3 and room number", async () => {
    const text =
      "# country, date, from, to, room\nXSA, 2026-12-08, 09:00, 10:00, 1\nXSB, 2026-12-09, 12:00, 12:30, 4";
    for (const key of ["focalA", "coordA", "i1"] as const) {
      expect(await refusal(importMeetingBlocks(v[key], text)), key).toBe(
        "forbidden",
      );
    }
    expect(await importMeetingBlocks(v.admin, text)).toEqual({
      countries: 2,
      blocks: 2,
    });
    const blocks = await db.meetingBlock.findMany({
      where: { countryId: { in: [C.a, C.b] } },
      select: { countryId: true, room: { select: { name: true } } },
    });
    expect(blocks).toHaveLength(2);
    expect(blocks.find((b) => b.countryId === C.b)?.room.name).toMatch(
      /^Room 4 - Hotel room B/,
    );
    expect(
      await refusal(
        importMeetingBlocks(v.admin, "XZZ, 2026-12-08, 09:00, 10:00, 1"),
      ),
    ).toBe("invalid:blocks");
    expect(
      await refusal(
        importMeetingBlocks(v.admin, "XSA, 2026-12-08, 10:00, 09:00, 1"),
      ),
    ).toBe("invalid:blocks");
    expect(
      await db.auditEvent.count({
        where: { action: SIGNUP_AUDIT.BLOCKS_IMPORT, actorId: v.admin.id },
      }),
    ).toBe(1);
  });

  it("lets only admins set counterparts, and shows them on the country's project pages", async () => {
    expect(
      await refusal(setCountryCounterparts(v.focalA, C.a, "Someone")),
    ).toBe("forbidden");
    await setCountryCounterparts(
      v.admin,
      C.a,
      "1. Ana Fictional, Director\n\n2. Ben Example, PPP Unit\n",
    );
    expect(await getProjectCounterparts(v.i1, P.a1)).toEqual([
      "1. Ana Fictional, Director",
      "2. Ben Example, PPP Unit",
    ]);
    // Not through a draft, which the investor cannot see in the pipeline.
    expect(await getProjectCounterparts(v.i1, P.aDraft)).toEqual([]);
  });
});

describe("signing up", () => {
  it("offers only the country's times and projects on the sheet", async () => {
    const panel = await getSignupPanel(v.i1, P.a1, { now: BEFORE });
    expect(panel?.days.flatMap((d) => d.times.map((t) => t.label))).toEqual([
      "09:00–09:20",
      "09:30–09:50",
    ]);
    expect(panel?.projects.map((p) => p.id).sort()).toEqual([P.a1, P.a2]);
    expect(panel?.signup).toBeNull();
    // Nobody but investors gets a sheet; and never on a draft.
    for (const key of ["admin", "focalA", "coordA"] as const) {
      expect(await getSignupPanel(v[key], P.a1), key).toBeNull();
    }
    expect(await getSignupPanel(v.i1, P.aDraft)).toBeNull();
  });

  it("stores one sign-up per investor and country, with the times and projects ticked", async () => {
    const { id, created } = await saveSignup(
      v.i1,
      P.a1,
      values([A1, A2], [P.a1, P.a2]),
      { now: BEFORE },
    );
    expect(created).toBe(true);
    R.i1 = id;
    const row = await db.meetingSignup.findUniqueOrThrow({
      where: { id },
      include: { projects: true },
    });
    expect(row).toMatchObject({ countryId: C.a, requesterId: v.i1.id });
    expect(row.slotStarts.map((d) => d.getTime())).toEqual([
      A1.getTime(),
      A2.getTime(),
    ]);
    expect(row.projects.map((p) => p.projectId).sort()).toEqual([P.a1, P.a2]);

    // From another project of the same country: the same sign-up is updated, not a second one.
    const again = await saveSignup(v.i1, P.a2, values([A2], [P.a2]), {
      now: BEFORE,
    });
    expect(again).toEqual({ id, created: false });
    expect(
      await db.meetingSignup.count({ where: { requesterId: v.i1.id } }),
    ).toBe(1);
    expect(
      (await db.meetingSignup.findUniqueOrThrow({ where: { id } })).slotStarts,
    ).toHaveLength(1);
    expect(
      await db.auditEvent.findMany({
        where: { entityId: id },
        select: { action: true },
        orderBy: { at: "asc" },
      }),
    ).toEqual([
      { action: SIGNUP_AUDIT.CREATE },
      { action: SIGNUP_AUDIT.UPDATE },
    ]);
  });

  it("never blocks another investor from the same times", async () => {
    const { id } = await saveSignup(
      v.i2,
      P.a1,
      values([A1, A2], [], "Bo Second"),
      { now: BEFORE },
    );
    R.i2 = id;
    expect(
      (await db.meetingSignup.findUniqueOrThrow({ where: { id } })).slotStarts,
    ).toHaveLength(2);
  });

  it("refuses times outside the country's blocks, no time at all, and projects of another country or drafts", async () => {
    expect(
      await refusal(saveSignup(v.i1, P.a1, values([B1]), { now: BEFORE })),
    ).toBe("invalid:slots");
    expect(
      await refusal(saveSignup(v.i1, P.a1, values([]), { now: BEFORE })),
    ).toBe("invalid:slots");
    expect(
      await refusal(
        saveSignup(v.i1, P.a1, values([A1], [P.b1]), { now: BEFORE }),
      ),
    ).toBe("invalid:projects");
    expect(
      await refusal(
        saveSignup(v.i1, P.a1, values([A1], [P.aDraft]), { now: BEFORE }),
      ),
    ).toBe("invalid:projects");
    // Through a draft, or as anyone but an investor: the project is not found.
    expect(
      await refusal(saveSignup(v.i1, P.aDraft, values([A1]), { now: BEFORE })),
    ).toBe("not_found");
    for (const key of ["admin", "focalA", "coordA"] as const) {
      expect(
        await refusal(saveSignup(v[key], P.a1, values([A1]), { now: BEFORE })),
        key,
      ).toBe("not_found");
    }
  });

  it("closes after the deadline: no new sign-ups, changes or withdrawals", async () => {
    expect(
      await refusal(saveSignup(v.i1, P.a1, values([A1]), { now: AFTER })),
    ).toBe("closed");
    expect(await refusal(withdrawSignup(v.i2, R.i2, { now: AFTER }))).toBe(
      "closed",
    );
    const panel = await getSignupPanel(v.i1, P.a1, { now: AFTER });
    expect(panel?.closed).toBe(true);
  });
});

describe("who sees which sign-ups", () => {
  it("shows countries and coordinators their own countries' sign-ups only", async () => {
    const a = await listCountrySignups(v.focalA);
    expect(a.map((s) => s.id).sort()).toEqual([R.i1, R.i2].sort());
    expect(
      (await listCountrySignups(v.coordA)).map((s) => s.id).sort(),
    ).toEqual([R.i1, R.i2].sort());
    expect(await listCountrySignups(v.focalB)).toEqual([]);
    // Narrowing to another country's id never widens anything.
    expect(await listCountrySignups(v.focalB, { countryId: C.a })).toEqual([]);
    expect((await listCountrySignups(v.admin)).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("shows an investor only their own sign-ups, and no country list", async () => {
    expect((await listMySignups(v.i2)).map((s) => s.id)).toEqual([R.i2]);
    expect(await listCountrySignups(v.i1)).toEqual([]);
    expect(await refusal(exportSignupsCsv(v.i1))).toBe("forbidden");
  });

  it("exports the country's sign-ups only, and audits the export", async () => {
    const { csv, count } = await exportSignupsCsv(v.focalB);
    expect(count).toBe(0);
    expect(csv).not.toContain("Fictional Fund");
    const a = await exportSignupsCsv(v.focalA);
    expect(a.count).toBe(2);
    expect(a.csv).toContain("Tuesday 8 December, 09:00–09:20");
    expect(
      await db.auditEvent.count({
        where: { action: SIGNUP_AUDIT.EXPORT, actorId: v.focalA.id },
      }),
    ).toBe(1);
  });

  it("lets only the investor withdraw their own sign-up", async () => {
    expect(await refusal(withdrawSignup(v.i2, R.i1, { now: BEFORE }))).toBe(
      "not_found",
    );
    expect(await refusal(withdrawSignup(v.focalA, R.i1, { now: BEFORE }))).toBe(
      "forbidden",
    );
    await withdrawSignup(v.i1, R.i1, { now: BEFORE });
    expect(
      (await db.meetingSignup.findUniqueOrThrow({ where: { id: R.i1 } }))
        .status,
    ).toBe("WITHDRAWN");
    // Signing up again reuses and reactivates the same sign-up.
    const again = await saveSignup(v.i1, P.a1, values([A1]), { now: BEFORE });
    expect(again).toEqual({ id: R.i1, created: false });
    expect(
      (await db.meetingSignup.findUniqueOrThrow({ where: { id: R.i1 } }))
        .status,
    ).toBe("ACTIVE");
  });
});
