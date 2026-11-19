// M3 (PLAN v0.3 section 4): the policy module against real PostgreSQL. Seed-like fixtures (two active countries
// and an inactive one, projects in every status, teaser versions, requests and slots) prove cross-country and
// cross-project isolation through the actual Prisma queries, that the pure can-functions agree with the where
// builders, and that file access is audited (view, download, refused).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryStatus,
  DocumentKind,
  MeetingRequestStatus,
  MembershipRole,
  ProjectStatus,
  ScanStatus,
  SlotStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import {
  AuthzError,
  authorizeDocumentFile,
  canDownloadDocument,
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
  projectWhere,
  publishBlocker,
  requestInboxWhere,
  userWhere,
  type Viewer,
} from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { cleanUp, createUser, viewerFor } from "./helpers";

const NOW = new Date();
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
  aDraftTeaser: "it-authz-d-a-draft-teaser",
  aWithdrawnTeaser: "it-authz-d-a-wd-teaser",
  bTeaser: "it-authz-d-b-teaser",
  bViewOnly: "it-authz-d-b-view-only",
  bDraftTeaser: "it-authz-d-b-draft-teaser",
  xTeaser: "it-authz-d-x-teaser",
} as const;
const R = {
  i1OnA: "it-authz-r-i1-a",
  i2OnA: "it-authz-r-i2-a",
  i2OnB: "it-authz-r-i2-b",
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

type Who =
  | "platformAdmin"
  | "summitAdmin"
  | "focalA"
  | "memberA"
  | "focalB"
  | "coordA"
  | "coordAB"
  | "investor1"
  | "investor2"
  | "investorNoAck"
  | "investorStrayMembership"
  | "pending";

let u: Record<Who, string>;
let v: Record<Who, Viewer | null>;

async function acceptInvestorAck(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: {
      investorAckTextVersion: appConfig.investorAcknowledgement.version,
      investorAckAcceptedAt: NOW,
    },
  });
}

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
  const make = async (
    role: UserRole,
    countryId?: string,
    membershipRole: MembershipRole = MembershipRole.FOCAL_POINT,
    status?: UserStatus,
  ) =>
    (
      await createUser({
        role,
        status,
        ...(countryId ? { countryId, membershipRole } : {}),
        ...active,
      })
    ).id;

  u = {
    platformAdmin: await make(UserRole.PLATFORM_ADMIN),
    summitAdmin: await make(UserRole.SUMMIT_ADMIN),
    focalA: await make(UserRole.COUNTRY, C.a),
    memberA: await make(UserRole.COUNTRY, C.a, MembershipRole.MEMBER),
    focalB: await make(UserRole.COUNTRY, C.b),
    coordA: await make(UserRole.WBG_COORDINATOR, C.a, MembershipRole.MEMBER),
    coordAB: await make(UserRole.WBG_COORDINATOR, C.a, MembershipRole.MEMBER),
    investor1: await make(UserRole.INVESTOR),
    investor2: await make(UserRole.INVESTOR),
    investorNoAck: await make(UserRole.INVESTOR),
    // A membership row on an investor (a data mistake) must not widen anything.
    investorStrayMembership: await make(UserRole.INVESTOR, C.a),
    pending: await make(
      UserRole.INVESTOR,
      undefined,
      undefined,
      UserStatus.PENDING_APPROVAL,
    ),
  };
  await db.countryMembership.create({
    data: {
      userId: u.coordAB,
      countryId: C.b,
      role: MembershipRole.MEMBER,
    },
  });
  for (const who of [
    "investor1",
    "investor2",
    "investorStrayMembership",
    "pending",
  ] as const) {
    await acceptInvestorAck(u[who]);
  }
  await db.user.update({
    where: { id: u.investorNoAck },
    data: { investorAckTextVersion: null, investorAckAcceptedAt: null },
  });

  const project = (id: string, countryId: string, status: ProjectStatus) => ({
    id,
    countryId,
    title: `Integration ${id}`,
    sector: "Test sector",
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

  // PLAN v0.3: every teaser is stored with the Submission that records the country's consent.
  const submissionOf = (countryId: string) => `it-authz-sub-${countryId}`;
  await db.submission.createMany({
    data: Object.values(C).map((countryId) => ({
      id: submissionOf(countryId),
      countryId,
      uploadLinkId: null,
      uploaderName: "Integration uploader",
      uploaderEmail: `uploader-${countryId}@it.example`,
      ackTextVersion: "it",
      ackAcceptedAt: NOW,
    })),
  });
  const countryOfProject: Record<string, string> = {
    [P.aPub]: C.a,
    [P.aDraft]: C.a,
    [P.aWithdrawn]: C.a,
    [P.bPub]: C.b,
    [P.bDraft]: C.b,
    [P.xPub]: C.x,
  };

  const doc = (
    id: string,
    projectId: string,
    extra: {
      scanStatus?: ScanStatus;
      version?: number;
      allowDownload?: boolean;
    } = {},
  ) => ({
    id,
    projectId,
    submissionId: submissionOf(countryOfProject[projectId]),
    kind: DocumentKind.TEASER,
    filename: `${id}.pdf`,
    version: extra.version ?? 1,
    allowDownload: extra.allowDownload ?? true,
    blobKey: `it/${id}.pdf`,
    sha256: "0".repeat(64),
    sizeBytes: 100,
    scanStatus: extra.scanStatus ?? ScanStatus.CLEAN,
  });
  await db.document.createMany({
    data: [
      doc(D.aTeaserV1, P.aPub),
      doc(D.aTeaserV2, P.aPub, { version: 2 }),
      doc(D.aDraftTeaser, P.aDraft, { scanStatus: ScanStatus.PENDING }),
      doc(D.aWithdrawnTeaser, P.aWithdrawn),
      doc(D.bTeaser, P.bPub),
      doc(D.bDraftTeaser, P.bDraft),
      doc(D.xTeaser, P.xPub),
    ],
  });
  await db.document.update({
    where: { id: D.aTeaserV1 },
    data: { supersededById: D.aTeaserV2 },
  });
  // A second project on B whose teaser an admin switched to view only.
  await db.project.create({
    data: project("it-authz-p-b-view-only", C.b, ProjectStatus.PUBLISHED),
  });
  countryOfProject["it-authz-p-b-view-only"] = C.b;
  await db.document.create({
    data: doc(D.bViewOnly, "it-authz-p-b-view-only", { allowDownload: false }),
  });

  await db.meetingRequest.createMany({
    data: [
      {
        id: R.i1OnA,
        projectId: P.aPub,
        requesterId: u.investor1,
        organisation: "IT Fund",
        role: "Analyst",
        status: MeetingRequestStatus.PENDING,
      },
      {
        id: R.i2OnA,
        projectId: P.aPub,
        requesterId: u.investor2,
        organisation: "IT Fund",
        role: "Analyst",
        status: MeetingRequestStatus.ACCEPTED,
        decidedById: u.focalA,
        decidedAt: NOW,
      },
      {
        id: R.i2OnB,
        projectId: P.bPub,
        requesterId: u.investor2,
        organisation: "IT Fund",
        role: "Analyst",
        status: MeetingRequestStatus.ACCEPTED,
        decidedById: u.focalB,
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
      slot(S.booked, 0, SlotStatus.BOOKED, R.i2OnB),
      slot(S.held, 30, SlotStatus.HELD, R.i2OnA),
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

const WHO = () => Object.keys(u) as Who[];
const sorted = (ids: readonly string[]) => [...ids].sort();
const ALL_PROJECT_IDS = [...ALL_PROJECTS, "it-authz-p-b-view-only"];

async function visibleProjects(viewer: Viewer | null) {
  const rows = await db.project.findMany({
    where: { AND: [projectWhere(viewer), { id: { in: ALL_PROJECT_IDS } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
}

async function visibleDocuments(viewer: Viewer | null) {
  const rows = await db.document.findMany({
    where: { AND: [documentWhere(viewer), { id: { in: ALL_DOCUMENTS } }] },
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

describe("account gate", () => {
  it("gives no viewer to a pending account or an investor without the investor acknowledgement", () => {
    expect(v.pending).toBeNull();
    expect(v.investorNoAck).toBeNull();
    expect(v.investor1).not.toBeNull();
  });

  it("asks again when the acknowledgement wording version changes", async () => {
    await db.user.update({
      where: { id: u.investor2 },
      data: { investorAckTextVersion: "an-older-version" },
    });
    try {
      expect(await viewerFor(u.investor2)).toBeNull();
    } finally {
      await acceptInvestorAck(u.investor2);
    }
    expect(await viewerFor(u.investor2)).not.toBeNull();
  });

  it("shows an investor without the acknowledgement nothing at all", async () => {
    expect(await visibleProjects(v.investorNoAck)).toEqual([]);
    expect(await visibleDocuments(v.investorNoAck)).toEqual([]);
    expect(await visibleRequests(v.investorNoAck)).toEqual([]);
    await expect(
      authorizeDocumentFile(v.investorNoAck, D.aTeaserV2, "view"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("projects", () => {
  const pipeline = [P.aPub, P.bPub, "it-authz-p-b-view-only"];
  const cases: [Who, string[]][] = [
    ["platformAdmin", ALL_PROJECT_IDS],
    ["summitAdmin", ALL_PROJECT_IDS],
    // Own country in full (drafts and withdrawn), nothing of any other country, published or not.
    ["focalA", [P.aPub, P.aDraft, P.aWithdrawn]],
    ["memberA", [P.aPub, P.aDraft, P.aWithdrawn]],
    ["focalB", [P.bPub, P.bDraft, "it-authz-p-b-view-only"]],
    // Every published project of an active country; never a draft, withdrawn or inactive country.
    ["coordA", pipeline],
    ["coordAB", pipeline],
    ["investor1", pipeline],
    ["investor2", pipeline],
    ["investorStrayMembership", pipeline],
    ["investorNoAck", []],
    ["pending", []],
  ];

  it.each(cases)("%s sees exactly the expected projects", async (who, ids) => {
    expect(await visibleProjects(v[who])).toEqual(sorted(ids));
  });

  it("agrees with canViewProject for every viewer and project", async () => {
    const projects = await db.project.findMany({
      where: { id: { in: ALL_PROJECT_IDS } },
      select: { id: true, ...PROJECT_POLICY_SELECT },
    });
    for (const who of WHO()) {
      const visible = await visibleProjects(v[who]);
      for (const p of projects) {
        expect(canViewProject(v[who], p), `${who} ${p.id}`).toBe(
          visible.includes(p.id),
        );
      }
    }
  });

  it("never returns another country's project or any draft to outsiders by id", async () => {
    expect(await findProjectFor(v.focalB, P.aDraft)).toBeNull();
    expect(await findProjectFor(v.focalB, P.aPub)).toBeNull();
    expect(await findProjectFor(v.focalA, P.bDraft)).toBeNull();
    expect(await findProjectFor(v.investor1, P.aDraft)).toBeNull();
    expect(await findProjectFor(v.investor1, P.aWithdrawn)).toBeNull();
    expect(await findProjectFor(v.coordA, P.aDraft)).toBeNull();
    expect(await findProjectFor(v.investor1, P.xPub)).toBeNull();
    expect(await findProjectFor(v.pending, P.aPub)).toBeNull();
    expect((await findProjectFor(v.memberA, P.aDraft))?.id).toBe(P.aDraft);
    expect((await findProjectFor(v.investor1, P.bPub))?.id).toBe(P.bPub);
  });
});

describe("documents", () => {
  const pipeline = [D.aTeaserV2, D.bTeaser, D.bViewOnly];
  const cases: [Who, string[]][] = [
    ["summitAdmin", ALL_DOCUMENTS],
    ["focalA", [D.aTeaserV1, D.aTeaserV2, D.aDraftTeaser, D.aWithdrawnTeaser]],
    ["memberA", [D.aTeaserV1, D.aTeaserV2, D.aDraftTeaser, D.aWithdrawnTeaser]],
    ["focalB", [D.bTeaser, D.bViewOnly, D.bDraftTeaser]],
    // Current clean teasers of published projects only: no old version, no draft, no inactive country.
    ["coordA", pipeline],
    ["investor1", pipeline],
    ["investorStrayMembership", pipeline],
    ["investorNoAck", []],
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
    for (const who of WHO()) {
      const visible = await visibleDocuments(v[who]);
      for (const d of docs) {
        expect(canViewDocument(v[who], d), `${who} ${d.id}`).toBe(
          visible.includes(d.id),
        );
      }
    }
  });

  it("never exposes the blob key in document metadata", async () => {
    const found = await findDocumentFor(v.investor1, D.aTeaserV2);
    expect(found?.id).toBe(D.aTeaserV2);
    expect(found).not.toHaveProperty("blobKey");
    expect(await findDocumentFor(v.investor1, D.aTeaserV1)).toBeNull();
    expect(await findDocumentFor(v.focalB, D.aTeaserV2)).toBeNull();
  });
});

describe("authorizeDocumentFile", () => {
  function audits(entityId: string, action: string, actorId: string | null) {
    return db.auditEvent.findMany({
      where: { entityId, action, actorId },
      select: { entityType: true, ip: true, userAgent: true, metadata: true },
    });
  }

  it("lets an investor open a published teaser and records the view", async () => {
    const file = await authorizeDocumentFile(v.investor1, D.aTeaserV2, "view", {
      meta,
    });
    expect(file.blobKey).toBe(`it/${D.aTeaserV2}.pdf`);
    expect(await audits(D.aTeaserV2, "document.view", u.investor1)).toEqual([
      {
        entityType: "Document",
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: {
          projectId: P.aPub,
          kind: DocumentKind.TEASER,
          version: 2,
          scanStatus: "CLEAN",
        },
      },
    ]);
  });

  it("allows investors and coordinators to download by default, and records each download", async () => {
    for (const who of ["investor1", "coordA"] as const) {
      const file = await authorizeDocumentFile(v[who], D.bTeaser, "download", {
        meta,
      });
      expect(file.id).toBe(D.bTeaser);
      expect(
        await audits(D.bTeaser, "document.download", u[who]),
        who,
      ).toHaveLength(1);
    }
  });

  it("refuses a download an admin switched off, opens it for viewing, and records the refusal", async () => {
    await expect(
      authorizeDocumentFile(v.investor2, D.bViewOnly, "download", { meta }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await audits(D.bViewOnly, "access.denied", u.investor2),
    ).toMatchObject([{ metadata: { mode: "download" } }]);
    expect(
      await audits(D.bViewOnly, "document.download", u.investor2),
    ).toHaveLength(0);
    await authorizeDocumentFile(v.investor2, D.bViewOnly, "view");
    // The owning country downloads its own teaser regardless of the switch.
    await authorizeDocumentFile(v.memberA, D.aTeaserV2, "download");
    expect(
      (await authorizeDocumentFile(v.focalB, D.bViewOnly, "download")).id,
    ).toBe(D.bViewOnly);
  });

  it("answers not_found across countries and projects, records it, and never reveals the file", async () => {
    const attempts: [Who, string][] = [
      ["investor1", D.aDraftTeaser],
      ["investor1", D.aWithdrawnTeaser],
      ["investor1", D.aTeaserV1],
      ["investor1", D.xTeaser],
      ["coordA", D.bDraftTeaser],
      ["focalB", D.aTeaserV2],
      ["focalB", D.aDraftTeaser],
      ["focalA", D.bDraftTeaser],
      ["focalA", D.bTeaser],
      ["investorStrayMembership", D.aDraftTeaser],
      ["investor1", "it-authz-does-not-exist"],
    ];
    for (const [who, id] of attempts) {
      for (const mode of ["view", "download"] as const) {
        const error = await authorizeDocumentFile(v[who], id, mode, {
          meta,
        }).catch((e: unknown) => e);
        expect(error, `${who} ${mode} ${id}`).toBeInstanceOf(AuthzError);
        expect((error as AuthzError).code, `${who} ${mode} ${id}`).toBe(
          "not_found",
        );
      }
      expect(
        await audits(id, "access.denied", u[who]),
        `${who} ${id}`,
      ).toHaveLength(2);
    }
  });

  it("records refused attempts by accounts without a viewer, without an actor", async () => {
    for (const who of ["pending", "investorNoAck"] as const) {
      await expect(
        authorizeDocumentFile(v[who], D.bTeaser, "view", { meta }),
      ).rejects.toBeInstanceOf(AuthzError);
    }
    expect(await audits(D.bTeaser, "access.denied", null)).toHaveLength(2);
  });

  it("does not serve a file before the virus scan is clean, except an admin download", async () => {
    await expect(
      authorizeDocumentFile(v.focalA, D.aDraftTeaser, "view"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      authorizeDocumentFile(v.focalA, D.aDraftTeaser, "download"),
    ).rejects.toMatchObject({ code: "forbidden" });
    const file = await authorizeDocumentFile(
      v.summitAdmin,
      D.aDraftTeaser,
      "download",
      { meta },
    );
    expect(file.scanStatus).toBe(ScanStatus.PENDING);
    expect(
      await audits(D.aDraftTeaser, "document.download", u.summitAdmin),
    ).toMatchObject([{ metadata: { scanStatus: "PENDING" } }]);
  });

  it("agrees with canDownloadDocument for every viewer and document", async () => {
    const docs = await db.document.findMany({
      where: { id: { in: ALL_DOCUMENTS } },
      include: { project: { select: PROJECT_POLICY_SELECT } },
    });
    for (const who of WHO()) {
      for (const d of docs) {
        const allowed = await authorizeDocumentFile(v[who], d.id, "download")
          .then(() => true)
          .catch(() => false);
        expect(allowed, `${who} ${d.id}`).toBe(canDownloadDocument(v[who], d));
      }
    }
  });
});

describe("meeting requests", () => {
  const cases: [Who, string[]][] = [
    ["summitAdmin", ALL_REQUESTS],
    ["platformAdmin", ALL_REQUESTS],
    // Countries see their own projects' requests only.
    ["focalA", [R.i1OnA, R.i2OnA]],
    ["memberA", [R.i1OnA, R.i2OnA]],
    ["focalB", [R.i2OnB]],
    // Coordinators read their own countries' requests only.
    ["coordA", [R.i1OnA, R.i2OnA]],
    ["coordAB", ALL_REQUESTS],
    // Investors see their own requests, never another investor's.
    ["investor1", [R.i1OnA]],
    ["investor2", [R.i2OnA, R.i2OnB]],
    ["investorStrayMembership", []],
    ["investorNoAck", []],
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
    for (const who of WHO()) {
      const visible = await visibleRequests(v[who]);
      for (const r of requests) {
        expect(canViewMeetingRequest(v[who], r), `${who} ${r.id}`).toBe(
          visible.includes(r.id),
        );
      }
    }
  });

  it("gives the country-side inbox only its own countries' requests, and investors none", async () => {
    const inbox = async (viewer: Viewer | null) =>
      (
        await db.meetingRequest.findMany({
          where: {
            AND: [requestInboxWhere(viewer), { id: { in: ALL_REQUESTS } }],
          },
          select: { id: true },
        })
      )
        .map((r) => r.id)
        .sort();
    const expected: [Who, string[]][] = [
      ["summitAdmin", ALL_REQUESTS],
      ["focalA", [R.i1OnA, R.i2OnA]],
      ["memberA", [R.i1OnA, R.i2OnA]],
      ["focalB", [R.i2OnB]],
      ["coordA", [R.i1OnA, R.i2OnA]],
      ["coordAB", ALL_REQUESTS],
      ["investor1", []],
      ["investor2", []],
      ["investorStrayMembership", []],
      ["pending", []],
    ];
    for (const [who, ids] of expected) {
      expect(await inbox(v[who]), who).toEqual(sorted(ids));
    }
  });

  it("does not return another country's or another investor's request by id", async () => {
    expect(await findMeetingRequestFor(v.focalB, R.i1OnA)).toBeNull();
    expect(await findMeetingRequestFor(v.focalA, R.i2OnB)).toBeNull();
    expect(await findMeetingRequestFor(v.coordA, R.i2OnB)).toBeNull();
    expect(await findMeetingRequestFor(v.investor1, R.i2OnA)).toBeNull();
    expect((await findMeetingRequestFor(v.memberA, R.i1OnA))?.id).toBe(R.i1OnA);
    expect((await findMeetingRequestFor(v.coordAB, R.i2OnB))?.id).toBe(R.i2OnB);
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
  const heldOnA = { status: SlotStatus.HELD, request: R.i2OnA, mine: true };
  const bookedOnB = { status: SlotStatus.BOOKED, request: R.i2OnB, mine: true };

  it("shows admins every booking in full", async () => {
    expect(await grid(v.summitAdmin)).toEqual({
      [S.booked]: bookedOnB,
      [S.held]: heldOnA,
      [S.open]: open,
    });
  });

  it("shows a country and its coordinators their own bookings and only 'Booked' for others", async () => {
    for (const who of ["focalA", "coordA"] as const) {
      expect(await grid(v[who]), who).toEqual({
        [S.booked]: booked,
        [S.held]: heldOnA,
        [S.open]: open,
      });
    }
    expect(await grid(v.focalB)).toEqual({
      [S.booked]: bookedOnB,
      [S.held]: booked,
      [S.open]: open,
    });
  });

  it("shows an investor only their own bookings", async () => {
    expect(await grid(v.investor2)).toEqual({
      [S.booked]: bookedOnB,
      [S.held]: heldOnA,
      [S.open]: open,
    });
    expect(await grid(v.investor1)).toEqual({
      [S.booked]: booked,
      [S.held]: booked,
      [S.open]: open,
    });
  });

  it("shows accounts without a viewer nothing", async () => {
    expect(await listSlotsFor(v.pending, window)).toEqual([]);
    expect(await listSlotsFor(v.investorNoAck, window)).toEqual([]);
  });
});

describe("publishing", () => {
  it("is for admins, once there is a current clean teaser (its Submission holds the consent)", async () => {
    expect(await publishBlocker(v.summitAdmin, P.bDraft)).toBeNull();
    expect(await publishBlocker(v.platformAdmin, P.aWithdrawn)).toBeNull();
    // The draft's only teaser is still waiting for its virus scan.
    expect(await publishBlocker(v.summitAdmin, P.aDraft)).toBe(
      "no_clean_teaser",
    );
    expect(await publishBlocker(v.summitAdmin, P.aPub)).toBe("forbidden");
  });

  it("is refused to every country user, coordinator and investor (v0.3: countries only see)", async () => {
    expect(await publishBlocker(v.focalB, P.bDraft)).toBe("forbidden");
    expect(await publishBlocker(v.memberA, P.aWithdrawn)).toBe("forbidden");
    expect(await publishBlocker(v.focalA, P.bDraft)).toBe("not_found");
    expect(await publishBlocker(v.coordA, P.aDraft)).toBe("not_found");
    expect(await publishBlocker(v.investor1, P.bDraft)).toBe("not_found");
    expect(await publishBlocker(v.pending, P.aDraft)).toBe("not_found");
  });

  it("cannot store a teaser without a Submission (database constraint)", async () => {
    await expect(
      db.document.create({
        data: {
          id: "it-authz-d-no-submission",
          projectId: P.aDraft,
          submissionId: "it-authz-no-such-submission",
          kind: DocumentKind.TEASER,
          filename: "x.pdf",
          blobKey: "it/no-submission.pdf",
          sha256: "0".repeat(64),
          sizeBytes: 1,
        },
      }),
    ).rejects.toThrow();
    expect(
      await db.document.count({ where: { id: "it-authz-d-no-submission" } }),
    ).toBe(0);
  });
});

describe("people and countries", () => {
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

  it("lists only the viewer's own country colleagues (never coordinators or other countries)", async () => {
    const people = (viewer: Viewer | null) =>
      ids(
        db.user.findMany({
          where: { AND: [userWhere(viewer), { id: { in: Object.values(u) } }] },
          select: { id: true },
        }),
      );
    expect(await people(v.focalA)).toEqual(sorted([u.focalA, u.memberA]));
    expect(await people(v.focalB)).toEqual([u.focalB]);
    expect(await people(v.coordA)).toEqual([u.coordA]);
    expect(await people(v.investor1)).toEqual([u.investor1]);
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
    expect(await countries(v.investor1)).toEqual([C.a, C.b]);
    expect(await countries(v.coordA)).toEqual([C.a, C.b]);
    expect(await countries(v.memberA)).toEqual([C.a]);
    expect(await countries(v.focalB)).toEqual([C.b]);
    expect(await countries(v.summitAdmin)).toEqual([C.a, C.b, C.x]);
    expect(await countries(v.pending)).toEqual([]);
  });
});
