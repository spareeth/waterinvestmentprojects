// M4: the policy module against real PostgreSQL. Seed-like fixtures (two active countries and an inactive one,
// projects in every status, teaser versions, extra material, grants, requests and slots) prove cross-country
// and cross-project isolation through the actual Prisma queries, and that the pure can-functions agree with
// the where builders.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryStatus,
  DocumentKind,
  GrantScope,
  MeetingRequestStatus,
  MeetingRequestType,
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  ProjectTier,
  ScanStatus,
  SlotStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import {
  AuthzError,
  authorizeDocumentFile,
  canViewDocument,
  canViewMeetingRequest,
  canViewProject,
  countryWhere,
  documentWhere,
  findDocumentFor,
  findMeetingRequestFor,
  findProjectFor,
  listSlotsFor,
  meetingRequestWhere,
  PROJECT_POLICY_SELECT,
  projectGrantWhere,
  projectWhere,
  publishBlocker,
  userWhere,
  type Viewer,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { cleanUp, createUser, viewerFor } from "./helpers";

const NOW = new Date();
const DAY = 24 * 60 * 60_000;
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };

const C = { a: "it-authz-a", b: "it-authz-b", x: "it-authz-x" } as const;
const P = {
  aPub: "it-authz-p-a-pub",
  aDraft: "it-authz-p-a-draft",
  aWithdrawn: "it-authz-p-a-wd",
  bPub: "it-authz-p-b-pub",
  bDraft: "it-authz-p-b-draft",
  xPub: "it-authz-p-x-pub",
} as const;
const D = {
  aTeaserV1: "it-authz-d-a-teaser-v1",
  aTeaserV2: "it-authz-d-a-teaser-v2",
  aExtra: "it-authz-d-a-extra",
  aDataroom: "it-authz-d-a-dataroom",
  aDraftTeaser: "it-authz-d-a-draft-teaser",
  bTeaser: "it-authz-d-b-teaser",
  bExtra: "it-authz-d-b-extra",
  bDraftTeaser: "it-authz-d-b-draft-teaser",
  xTeaser: "it-authz-d-x-teaser",
} as const;
const R = {
  r1: "it-authz-r1",
  r2: "it-authz-r2",
  r3: "it-authz-r3",
} as const;
const ROOM = "it-authz-room";
const S = {
  booked: "it-authz-s-booked",
  held: "it-authz-s-held",
  open: "it-authz-s-open",
} as const;
const SLOT_DAY = new Date("2030-01-15T05:00:00Z");

const ALL_PROJECTS = Object.values(P);
const ALL_DOCUMENTS = Object.values(D);
const ALL_REQUESTS = Object.values(R);

let u: Record<
  | "platformAdmin"
  | "summitAdmin"
  | "focalA"
  | "memberA"
  | "focalB"
  | "investorAll"
  | "investorSelectedB"
  | "investorNone"
  | "investorGranted"
  | "investorExpired"
  | "investorRevoked"
  | "pending",
  string
>;
let v: Record<keyof typeof u, Viewer | null>;

async function createFixtures() {
  for (const [key, id] of Object.entries(C)) {
    await db.country.create({
      data: {
        id,
        name: `Integration Authz ${key.toUpperCase()}`,
        iso3: `XZ${key.toUpperCase()}`,
        status: key === "x" ? CountryStatus.INACTIVE : CountryStatus.ACTIVE,
      },
    });
  }
  const active = { mfaEnabled: true, termsAccepted: true };
  const investor = (pipelineScope: PipelineScope, status?: UserStatus) =>
    createUser({ role: UserRole.INVESTOR, pipelineScope, status, ...active });
  u = {
    platformAdmin: (
      await createUser({ role: UserRole.PLATFORM_ADMIN, ...active })
    ).id,
    summitAdmin: (await createUser({ role: UserRole.SUMMIT_ADMIN, ...active }))
      .id,
    focalA: (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.FOCAL_POINT,
        countryId: C.a,
        ...active,
      })
    ).id,
    memberA: (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.MEMBER,
        countryId: C.a,
        ...active,
      })
    ).id,
    // A country user who was also given the whole pipeline.
    focalB: (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.FOCAL_POINT,
        countryId: C.b,
        pipelineScope: PipelineScope.ALL,
        ...active,
      })
    ).id,
    investorAll: (await investor(PipelineScope.ALL)).id,
    investorSelectedB: (await investor(PipelineScope.SELECTED)).id,
    investorNone: (await investor(PipelineScope.NONE)).id,
    investorGranted: (await investor(PipelineScope.ALL)).id,
    investorExpired: (await investor(PipelineScope.ALL)).id,
    investorRevoked: (await investor(PipelineScope.ALL)).id,
    pending: (await investor(PipelineScope.ALL, UserStatus.PENDING_APPROVAL))
      .id,
  };
  await db.pipelineCountry.create({
    data: { userId: u.investorSelectedB, countryId: C.b },
  });

  const project = (id: string, countryId: string, status: ProjectStatus) => ({
    id,
    countryId,
    name: `Integration ${id}`,
    sector: "Test sector",
    tier: ProjectTier.TIER1,
    status,
    publishedAt: status === ProjectStatus.DRAFT ? null : NOW,
  });
  await db.project.createMany({
    data: [
      project(P.aPub, C.a, ProjectStatus.PUBLISHED),
      project(P.aDraft, C.a, ProjectStatus.DRAFT),
      project(P.aWithdrawn, C.a, ProjectStatus.WITHDRAWN),
      project(P.bPub, C.b, ProjectStatus.PUBLISHED),
      project(P.bDraft, C.b, ProjectStatus.DRAFT),
      project(P.xPub, C.x, ProjectStatus.PUBLISHED),
    ],
  });

  const doc = (
    id: string,
    projectId: string,
    kind: DocumentKind,
    extra: {
      scanStatus?: ScanStatus;
      version?: number;
      allowDownload?: boolean;
      uploadedById?: string;
    } = {},
  ) => ({
    id,
    projectId,
    kind,
    title: id,
    filename: `${id}.pdf`,
    version: extra.version ?? 1,
    allowDownload: extra.allowDownload ?? false,
    blobKey: `it/${id}.pdf`,
    sha256: "0".repeat(64),
    sizeBytes: 100,
    scanStatus: extra.scanStatus ?? ScanStatus.CLEAN,
    uploadedById: extra.uploadedById ?? u.focalA,
  });
  const byB = { uploadedById: u.focalB };
  await db.document.createMany({
    data: [
      doc(D.aTeaserV1, P.aPub, DocumentKind.TEASER),
      doc(D.aTeaserV2, P.aPub, DocumentKind.TEASER, { version: 2 }),
      doc(D.aExtra, P.aPub, DocumentKind.EXTRA),
      doc(D.aDataroom, P.aPub, DocumentKind.DATAROOM),
      doc(D.aDraftTeaser, P.aDraft, DocumentKind.TEASER, {
        scanStatus: ScanStatus.PENDING,
      }),
      doc(D.bTeaser, P.bPub, DocumentKind.TEASER, {
        allowDownload: true,
        ...byB,
      }),
      doc(D.bExtra, P.bPub, DocumentKind.EXTRA, byB),
      doc(D.bDraftTeaser, P.bDraft, DocumentKind.TEASER, byB),
      doc(D.xTeaser, P.xPub, DocumentKind.TEASER, byB),
    ],
  });
  await db.document.update({
    where: { id: D.aTeaserV1 },
    data: { supersededById: D.aTeaserV2 },
  });
  await db.acknowledgement.create({
    data: {
      id: "it-authz-ack-a",
      projectId: P.aPub,
      documentId: D.aTeaserV2,
      userId: u.focalA,
      textVersion: "it",
    },
  });

  const grant = (
    id: string,
    userId: string,
    expiresAt: Date,
    revokedAt: Date | null = null,
  ) => ({
    id,
    userId,
    projectId: P.aPub,
    scope: GrantScope.EXTRA,
    grantedById: u.focalA,
    expiresAt,
    revokedAt,
  });
  await db.projectGrant.createMany({
    data: [
      grant("it-authz-g-active", u.investorGranted, new Date(+NOW + 7 * DAY)),
      grant("it-authz-g-expired", u.investorExpired, new Date(+NOW - DAY)),
      grant(
        "it-authz-g-revoked",
        u.investorRevoked,
        new Date(+NOW + 7 * DAY),
        new Date(+NOW - DAY),
      ),
    ],
  });

  await db.meetingRequest.createMany({
    data: [
      {
        id: R.r1,
        projectId: P.aPub,
        requesterId: u.investorAll,
        type: MeetingRequestType.MEETING,
        status: MeetingRequestStatus.PENDING,
      },
      {
        id: R.r2,
        projectId: P.bPub,
        requesterId: u.investorSelectedB,
        type: MeetingRequestType.MEETING,
        status: MeetingRequestStatus.ACCEPTED,
        decidedById: u.focalB,
        decidedAt: NOW,
      },
      {
        id: R.r3,
        projectId: P.aPub,
        requesterId: u.investorGranted,
        type: MeetingRequestType.INFO,
        status: MeetingRequestStatus.ACCEPTED,
        decidedById: u.focalA,
        decidedAt: NOW,
      },
    ],
  });

  await db.room.create({
    data: { id: ROOM, name: "Integration authz room", capacity: 4 },
  });
  const slot = (
    id: string,
    minutes: number,
    status: SlotStatus,
    meetingRequestId: string | null,
  ) => ({
    id,
    roomId: ROOM,
    startsAt: new Date(+SLOT_DAY + minutes * 60_000),
    endsAt: new Date(+SLOT_DAY + (minutes + 30) * 60_000),
    status,
    meetingRequestId,
  });
  await db.slot.createMany({
    data: [
      slot(S.booked, 0, SlotStatus.BOOKED, R.r2),
      slot(S.held, 30, SlotStatus.HELD, R.r3),
      slot(S.open, 60, SlotStatus.OPEN, null),
    ],
  });

  v = Object.fromEntries(
    await Promise.all(
      Object.entries(u).map(async ([k, id]) => [k, await viewerFor(id)]),
    ),
  ) as typeof v;
}

beforeAll(async () => {
  await cleanUp();
  await createFixtures();
});

afterAll(cleanUp);

async function visibleProjects(viewer: Viewer | null) {
  const rows = await db.project.findMany({
    where: { AND: [projectWhere(viewer), { id: { in: ALL_PROJECTS } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
}

async function visibleDocuments(viewer: Viewer | null) {
  const rows = await db.document.findMany({
    where: {
      AND: [documentWhere(viewer, NOW), { id: { in: ALL_DOCUMENTS } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
}

async function visibleRequests(viewer: Viewer | null) {
  const rows = await db.meetingRequest.findMany({
    where: {
      AND: [meetingRequestWhere(viewer), { id: { in: ALL_REQUESTS } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
}

const sorted = (ids: string[]) => [...ids].sort();

describe("account stage", () => {
  it("gives a pending account no viewer at all", () => {
    expect(v.pending).toBeNull();
    expect(v.investorAll).not.toBeNull();
  });
});

describe("projects", () => {
  const cases: [keyof typeof u, string[]][] = [
    ["platformAdmin", ALL_PROJECTS],
    ["summitAdmin", ALL_PROJECTS],
    ["focalA", [P.aPub, P.aDraft, P.aWithdrawn]],
    ["memberA", [P.aPub, P.aDraft, P.aWithdrawn]],
    // Own country in full, plus the other countries' published projects (pipeline ALL).
    ["focalB", [P.bPub, P.bDraft, P.aPub]],
    // Published only, never the inactive country.
    ["investorAll", [P.aPub, P.bPub]],
    ["investorSelectedB", [P.bPub]],
    ["investorNone", []],
    ["pending", []],
  ];

  it.each(cases)("%s sees exactly the expected projects", async (who, ids) => {
    expect(await visibleProjects(v[who])).toEqual(sorted(ids));
  });

  it("agrees with canViewProject for every viewer and project", async () => {
    const projects = await db.project.findMany({
      where: { id: { in: ALL_PROJECTS } },
      select: { id: true, ...PROJECT_POLICY_SELECT },
    });
    for (const who of Object.keys(u) as (keyof typeof u)[]) {
      const visible = await visibleProjects(v[who]);
      for (const p of projects) {
        expect(canViewProject(v[who], p), `${who} ${p.id}`).toBe(
          visible.includes(p.id),
        );
      }
    }
  });

  it("never returns another country's draft by id", async () => {
    expect(await findProjectFor(v.focalB, P.aDraft)).toBeNull();
    expect(await findProjectFor(v.investorAll, P.aDraft)).toBeNull();
    expect(await findProjectFor(v.focalA, P.bDraft)).toBeNull();
    expect(await findProjectFor(v.pending, P.aPub)).toBeNull();
    expect((await findProjectFor(v.memberA, P.aDraft))?.id).toBe(P.aDraft);
  });
});

describe("documents", () => {
  const pipeline = [D.aTeaserV2, D.bTeaser];
  const cases: [keyof typeof u, string[]][] = [
    ["summitAdmin", ALL_DOCUMENTS],
    [
      "focalA",
      [D.aTeaserV1, D.aTeaserV2, D.aExtra, D.aDataroom, D.aDraftTeaser],
    ],
    ["focalB", [D.bTeaser, D.bExtra, D.bDraftTeaser, D.aTeaserV2]],
    // Current clean teasers only: no old version, no extra, no dataroom, no inactive country.
    ["investorAll", pipeline],
    ["investorGranted", [...pipeline, D.aExtra]],
    ["investorExpired", pipeline],
    ["investorRevoked", pipeline],
    ["investorSelectedB", [D.bTeaser]],
    ["investorNone", []],
    ["pending", []],
  ];

  it.each(cases)("%s sees exactly the expected documents", async (who, ids) => {
    expect(await visibleDocuments(v[who])).toEqual(sorted(ids));
  });

  it("agrees with canViewDocument for every viewer and document", async () => {
    const docs = await db.document.findMany({
      where: { id: { in: ALL_DOCUMENTS } },
      include: { project: { select: PROJECT_POLICY_SELECT } },
    });
    for (const who of Object.keys(u) as (keyof typeof u)[]) {
      const viewer = v[who];
      const grants = await db.projectGrant.findMany({
        where: { userId: u[who] },
      });
      const visible = await visibleDocuments(viewer);
      for (const d of docs) {
        expect(
          canViewDocument(viewer, d, { grants, now: NOW }),
          `${who} ${d.id}`,
        ).toBe(visible.includes(d.id));
      }
    }
  });

  it("never exposes the blob key in document metadata", async () => {
    const found = await findDocumentFor(v.investorAll, D.aTeaserV2);
    expect(found?.id).toBe(D.aTeaserV2);
    expect(found).not.toHaveProperty("blobKey");
  });
});

describe("authorizeDocumentFile", () => {
  function audits(entityId: string, action: string, actorId: string | null) {
    return db.auditEvent.findMany({
      where: { entityId, action, actorId },
      select: { entityType: true, ip: true, metadata: true },
    });
  }

  it("lets an investor open a published teaser and records the view", async () => {
    const file = await authorizeDocumentFile(
      v.investorAll,
      D.aTeaserV2,
      "view",
      { meta },
    );
    expect(file.blobKey).toBe(`it/${D.aTeaserV2}.pdf`);
    expect(await audits(D.aTeaserV2, "document.view", u.investorAll)).toEqual([
      {
        entityType: "Document",
        ip: meta.ip,
        metadata: { projectId: P.aPub, kind: DocumentKind.TEASER, version: 2 },
      },
    ]);
  });

  it("refuses an investor download when the teaser does not allow it, and records it", async () => {
    await expect(
      authorizeDocumentFile(v.investorAll, D.aTeaserV2, "download", { meta }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await audits(D.aTeaserV2, "access.denied", u.investorAll),
    ).toHaveLength(1);
    expect(
      await audits(D.aTeaserV2, "document.download", u.investorAll),
    ).toHaveLength(0);
  });

  it("allows the download where the country switched it on", async () => {
    await authorizeDocumentFile(v.investorAll, D.bTeaser, "download", { meta });
    expect(
      await audits(D.bTeaser, "document.download", u.investorAll),
    ).toHaveLength(1);
  });

  it("records refused attempts by accounts that are not active, without an actor", async () => {
    await expect(
      authorizeDocumentFile(v.pending, D.aExtra, "view", { meta }),
    ).rejects.toBeInstanceOf(AuthzError);
    expect(await audits(D.aExtra, "access.denied", null)).toHaveLength(1);
  });

  it("lets the owning country download its own teaser regardless of the flag", async () => {
    const file = await authorizeDocumentFile(
      v.memberA,
      D.aTeaserV2,
      "download",
    );
    expect(file.id).toBe(D.aTeaserV2);
  });

  it("answers not_found across countries and projects, never revealing the file", async () => {
    const attempts: [Viewer | null, string][] = [
      [v.investorAll, D.aDraftTeaser],
      [v.focalB, D.aDraftTeaser],
      [v.focalB, D.aExtra],
      [v.focalA, D.bDraftTeaser],
      [v.investorAll, D.aTeaserV1],
      [v.investorAll, D.aDataroom],
      [v.investorAll, D.xTeaser],
      [v.investorSelectedB, D.aTeaserV2],
      [v.pending, D.bTeaser],
      [v.investorAll, "it-authz-does-not-exist"],
    ];
    for (const [viewer, id] of attempts) {
      const error = await authorizeDocumentFile(viewer, id, "view").catch(
        (e: unknown) => e,
      );
      expect(error, `${viewer?.id ?? "pending"} ${id}`).toBeInstanceOf(
        AuthzError,
      );
      expect((error as AuthzError).code).toBe("not_found");
    }
  });

  it("serves EXTRA material only with an active, unrevoked grant", async () => {
    const file = await authorizeDocumentFile(
      v.investorGranted,
      D.aExtra,
      "view",
    );
    expect(file.id).toBe(D.aExtra);
    for (const viewer of [
      v.investorExpired,
      v.investorRevoked,
      v.investorAll,
    ]) {
      await expect(
        authorizeDocumentFile(viewer, D.aExtra, "view"),
      ).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("does not serve a file before the virus scan is clean, even to its country", async () => {
    await expect(
      authorizeDocumentFile(v.focalA, D.aDraftTeaser, "view"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("meeting requests", () => {
  const cases: [keyof typeof u, string[]][] = [
    ["summitAdmin", ALL_REQUESTS],
    ["platformAdmin", ALL_REQUESTS],
    ["focalA", [R.r1, R.r3]],
    ["memberA", [R.r1, R.r3]],
    ["focalB", [R.r2]],
    ["investorAll", [R.r1]],
    ["investorSelectedB", [R.r2]],
    ["investorGranted", [R.r3]],
    ["investorNone", []],
    ["pending", []],
  ];

  it.each(cases)("%s sees exactly the expected requests", async (who, ids) => {
    expect(await visibleRequests(v[who])).toEqual(sorted(ids));
  });

  it("agrees with canViewMeetingRequest", async () => {
    const requests = await db.meetingRequest.findMany({
      where: { id: { in: ALL_REQUESTS } },
      select: {
        id: true,
        requesterId: true,
        status: true,
        project: { select: { countryId: true } },
      },
    });
    for (const who of Object.keys(u) as (keyof typeof u)[]) {
      const visible = await visibleRequests(v[who]);
      for (const r of requests) {
        expect(canViewMeetingRequest(v[who], r), `${who} ${r.id}`).toBe(
          visible.includes(r.id),
        );
      }
    }
  });

  it("does not return another country's or another investor's request by id", async () => {
    expect(await findMeetingRequestFor(v.focalB, R.r1)).toBeNull();
    expect(await findMeetingRequestFor(v.investorAll, R.r3)).toBeNull();
    expect((await findMeetingRequestFor(v.memberA, R.r1))?.id).toBe(R.r1);
  });
});

describe("slots", () => {
  const window = {
    from: SLOT_DAY,
    to: new Date(+SLOT_DAY + 2 * 60 * 60_000),
  };
  async function grid(viewer: Viewer | null) {
    const slots = await listSlotsFor(viewer, window);
    return Object.fromEntries(
      slots
        .filter((s) => s.roomId === ROOM)
        .map((s) => [
          s.id,
          { status: s.status, request: s.meetingRequestId, mine: s.mine },
        ]),
    );
  }
  const booked = { status: SlotStatus.BOOKED, request: null, mine: false };
  const open = { status: SlotStatus.OPEN, request: null, mine: false };

  it("shows admins every booking in full", async () => {
    expect(await grid(v.summitAdmin)).toEqual({
      [S.booked]: { status: SlotStatus.BOOKED, request: R.r2, mine: true },
      [S.held]: { status: SlotStatus.HELD, request: R.r3, mine: true },
      [S.open]: open,
    });
  });

  it("shows a country its own bookings and only 'Booked' for others", async () => {
    expect(await grid(v.focalA)).toEqual({
      [S.booked]: booked,
      [S.held]: { status: SlotStatus.HELD, request: R.r3, mine: true },
      [S.open]: open,
    });
    // A held slot of another country looks exactly like a booked one.
    expect(await grid(v.focalB)).toEqual({
      [S.booked]: { status: SlotStatus.BOOKED, request: R.r2, mine: true },
      [S.held]: booked,
      [S.open]: open,
    });
  });

  it("shows an investor only their own booking", async () => {
    expect(await grid(v.investorSelectedB)).toEqual({
      [S.booked]: { status: SlotStatus.BOOKED, request: R.r2, mine: true },
      [S.held]: booked,
      [S.open]: open,
    });
    expect(await grid(v.investorAll)).toEqual({
      [S.booked]: booked,
      [S.held]: booked,
      [S.open]: open,
    });
  });

  it("shows a pending account nothing", async () => {
    expect(await listSlotsFor(v.pending, window)).toEqual([]);
  });
});

describe("publishing", () => {
  it("is allowed once the current clean teaser has an acknowledgement", async () => {
    // No teaser at all, and a teaser still waiting for its virus scan.
    expect(await publishBlocker(v.focalA, P.aWithdrawn)).toBe(
      "no_clean_teaser",
    );
    expect(await publishBlocker(v.focalA, P.aDraft)).toBe("no_clean_teaser");
    expect(await publishBlocker(v.focalB, P.bDraft)).toBe("no_acknowledgement");
    await db.acknowledgement.create({
      data: {
        id: "it-authz-ack-b-draft",
        projectId: P.bDraft,
        documentId: D.bDraftTeaser,
        userId: u.focalB,
        textVersion: "it",
      },
    });
    expect(await publishBlocker(v.focalB, P.bDraft)).toBeNull();
    expect(await publishBlocker(v.summitAdmin, P.bDraft)).toBeNull();
  });

  it("is refused to members, other countries and investors", async () => {
    expect(await publishBlocker(v.memberA, P.aDraft)).toBe("forbidden");
    expect(await publishBlocker(v.focalA, P.bDraft)).toBe("not_found");
    expect(await publishBlocker(v.investorAll, P.bDraft)).toBe("not_found");
    expect(await publishBlocker(v.focalA, P.aPub)).toBe("forbidden");
    expect(await publishBlocker(v.pending, P.aDraft)).toBe("not_found");
  });
});

describe("grants, people and countries", () => {
  async function ids(
    rows: Promise<{ id: string }[]>,
    keep: (id: string) => boolean = () => true,
  ) {
    return (await rows)
      .map((r) => r.id)
      .filter(keep)
      .sort();
  }
  const itOnly = (id: string) => id.startsWith("it-");

  it("shows grants to the grantee, the owning country and admins only", async () => {
    const grants = (viewer: Viewer | null) =>
      ids(
        db.projectGrant.findMany({
          where: { AND: [projectGrantWhere(viewer), { projectId: P.aPub }] },
          select: { id: true },
        }),
      );
    expect(await grants(v.investorGranted)).toEqual(["it-authz-g-active"]);
    expect(await grants(v.memberA)).toHaveLength(3);
    expect(await grants(v.summitAdmin)).toHaveLength(3);
    expect(await grants(v.focalB)).toEqual([]);
    expect(await grants(v.investorAll)).toEqual([]);
  });

  it("lists only the viewer's own country colleagues", async () => {
    const people = (viewer: Viewer | null) =>
      ids(
        db.user.findMany({
          where: { AND: [userWhere(viewer), { id: { in: Object.values(u) } }] },
          select: { id: true },
        }),
      );
    expect(await people(v.focalA)).toEqual(sorted([u.focalA, u.memberA]));
    expect(await people(v.focalB)).toEqual([u.focalB]);
    expect(await people(v.investorAll)).toEqual([u.investorAll]);
    expect(await people(v.pending)).toEqual([]);
  });

  it("names only the countries in the viewer's pipeline or workspace", async () => {
    const countries = (viewer: Viewer | null) =>
      ids(
        db.country.findMany({
          where: countryWhere(viewer),
          select: { id: true },
        }),
        itOnly,
      );
    expect(await countries(v.investorAll)).toEqual([C.a, C.b]);
    expect(await countries(v.investorSelectedB)).toEqual([C.b]);
    expect(await countries(v.memberA)).toEqual([C.a]);
    expect(await countries(v.summitAdmin)).toEqual([C.a, C.b, C.x]);
    expect(await countries(v.pending)).toEqual([]);
  });
});
