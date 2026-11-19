// M4 (PLAN v0.3 F3, F4): the pipeline query and project page against real PostgreSQL. Proves that the pipeline
// never returns drafts, withdrawn projects or projects of inactive countries, never another country's draft,
// and that no filter or search value can widen what the policy module lets a viewer see (cross-country and
// cross-project isolation). The local database also holds the seed, so assertions check fixture ids, and the
// "only published" checks run over everything returned.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryStatus,
  DocumentKind,
  MembershipRole,
  ProjectStatus,
  ScanStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import type { Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import type { PipelineFilters } from "@/lib/pipeline/filters";
import {
  getPipelineProject,
  listPipelineProjects,
  pipelineFacets,
} from "@/lib/pipeline/service";
import { cleanUp, createUser, viewerFor } from "./helpers";

const NOW = new Date();
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };

const C = { a: "it-pipe-a", b: "it-pipe-b", x: "it-pipe-x" } as const;
const ISO = { a: "XQA", b: "XQB", x: "XQX" } as const;
const P = {
  aPub: "it-pipe-p-a-pub",
  aDraft: "it-pipe-p-a-draft",
  aWithdrawn: "it-pipe-p-a-wd",
  bPub: "it-pipe-p-b-pub",
  bDraft: "it-pipe-p-b-draft",
  xPub: "it-pipe-p-x-pub",
} as const;
const D = {
  aV1: "it-pipe-d-a-v1",
  aV2: "it-pipe-d-a-v2",
  bTeaser: "it-pipe-d-b",
  bDraftTeaser: "it-pipe-d-b-draft",
  xTeaser: "it-pipe-d-x",
} as const;
const FIXTURE_PROJECTS = Object.values(P) as string[];
const HIDDEN = [P.aDraft, P.aWithdrawn, P.bDraft, P.xPub] as string[];

// Values only the hidden projects carry, so a filter on them must find nothing.
const SECRET = {
  title: "Zephyr secret draft",
  ppp: "Integration hidden PPP",
  stage: "Integration hidden stage",
  sector: "Integration hidden sector",
} as const;

type Who = "admin" | "focalA" | "focalB" | "investor" | "pending";
let v: Record<Who, Viewer | null>;
const signedIn = (): [string, Viewer | null][] => [
  ["admin", v.admin],
  ["focalA", v.focalA],
  ["focalB", v.focalB],
  ["investor", v.investor],
];

async function createFixtures() {
  for (const [key, id] of Object.entries(C)) {
    await db.country.create({
      data: {
        id,
        name: `Integration Pipeline ${key.toUpperCase()}`,
        iso3: ISO[key as keyof typeof ISO],
        status: key === "x" ? CountryStatus.INACTIVE : CountryStatus.ACTIVE,
      },
    });
  }
  const active = { mfaEnabled: true, termsAccepted: true };
  const ids = {
    admin: (await createUser({ role: UserRole.SUMMIT_ADMIN, ...active })).id,
    focalA: (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.FOCAL_POINT,
        countryId: C.a,
        ...active,
      })
    ).id,
    focalB: (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.FOCAL_POINT,
        countryId: C.b,
        ...active,
      })
    ).id,
    investor: (
      await createUser({
        role: UserRole.INVESTOR,
        ...active,
      })
    ).id,
    pending: (
      await createUser({
        role: UserRole.INVESTOR,
        status: UserStatus.PENDING_APPROVAL,
        ...active,
      })
    ).id,
  };
  v = {
    admin: await viewerFor(ids.admin),
    focalA: await viewerFor(ids.focalA),
    focalB: await viewerFor(ids.focalB),
    investor: await viewerFor(ids.investor),
    pending: await viewerFor(ids.pending),
  };

  const visible = {
    sector: "Integration reuse",
    pppModel: "Integration concession",
    developmentStage: "Integration concept",
  };
  const hidden = {
    sector: SECRET.sector,
    pppModel: SECRET.ppp,
    developmentStage: SECRET.stage,
  };
  const project = (
    id: string,
    countryId: string,
    status: ProjectStatus,
    title: string,
    fields: typeof visible,
    size: [number, number] | null,
  ) => ({
    id,
    countryId,
    title,
    status,
    ...fields,
    sizeMinUsd: size?.[0] ?? null,
    sizeMaxUsd: size?.[1] ?? null,
    publishedAt: status === ProjectStatus.DRAFT ? null : NOW,
  });
  const big: [number, number] = [450_000_000, 600_000_000];
  await db.project.createMany({
    data: [
      project(
        P.aPub,
        C.a,
        ProjectStatus.PUBLISHED,
        "Alpha reuse scheme",
        visible,
        [40_000_000, 55_000_000],
      ),
      project(
        P.aDraft,
        C.a,
        ProjectStatus.DRAFT,
        `${SECRET.title} A`,
        hidden,
        big,
      ),
      project(
        P.aWithdrawn,
        C.a,
        ProjectStatus.WITHDRAWN,
        `${SECRET.title} withdrawn`,
        hidden,
        big,
      ),
      project(
        P.bPub,
        C.b,
        ProjectStatus.PUBLISHED,
        "Bravo desalination",
        visible,
        big,
      ),
      project(
        P.bDraft,
        C.b,
        ProjectStatus.DRAFT,
        `${SECRET.title} B`,
        hidden,
        big,
      ),
      project(
        P.xPub,
        C.x,
        ProjectStatus.PUBLISHED,
        `${SECRET.title} X`,
        hidden,
        big,
      ),
    ],
  });

  const submissionOf = (countryId: string) => `it-pipe-sub-${countryId}`;
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
  const doc = (
    id: string,
    projectId: string,
    countryId: string,
    version: number,
    allowDownload: boolean,
  ) => ({
    id,
    projectId,
    submissionId: submissionOf(countryId),
    kind: DocumentKind.TEASER,
    filename: `${id}.pdf`,
    version,
    allowDownload,
    blobKey: `it/${id}.pdf`,
    sha256: "0".repeat(64),
    sizeBytes: 100,
    scanStatus: ScanStatus.CLEAN,
  });
  await db.document.createMany({
    data: [
      doc(D.aV1, P.aPub, C.a, 1, true),
      doc(D.aV2, P.aPub, C.a, 2, false),
      doc(D.bTeaser, P.bPub, C.b, 1, true),
      doc(D.bDraftTeaser, P.bDraft, C.b, 1, true),
      doc(D.xTeaser, P.xPub, C.x, 1, true),
    ],
  });
  await db.document.update({
    where: { id: D.aV1 },
    data: { supersededById: D.aV2 },
  });
}

async function ids(viewer: Viewer | null, filters: PipelineFilters = {}) {
  return (await listPipelineProjects(viewer, filters)).map((p) => p.id);
}

const fixtures = (list: string[]) =>
  list.filter((id) => FIXTURE_PROJECTS.includes(id)).sort();

beforeAll(async () => {
  await cleanUp();
  await createFixtures();
});

afterAll(async () => {
  await cleanUp();
});

describe("pipeline list", () => {
  it("returns only PUBLISHED projects of ACTIVE countries, for every role", async () => {
    for (const [, viewer] of signedIn()) {
      const list = await ids(viewer);
      const rows = await db.project.findMany({
        where: { id: { in: list } },
        select: { status: true, country: { select: { status: true } } },
      });
      expect(rows).toHaveLength(list.length);
      for (const row of rows) {
        expect(row.status).toBe(ProjectStatus.PUBLISHED);
        expect(row.country.status).toBe(CountryStatus.ACTIVE);
      }
      for (const id of HIDDEN) expect(list).not.toContain(id);
    }
  });

  it("shows investors and admins the published projects of every country", async () => {
    expect(fixtures(await ids(v.investor))).toEqual([P.aPub, P.bPub].sort());
    expect(fixtures(await ids(v.admin))).toEqual([P.aPub, P.bPub].sort());
  });

  it("never shows a country user another country's draft, nor their own draft", async () => {
    const a = await ids(v.focalA);
    expect(a).toContain(P.aPub);
    expect(a).not.toContain(P.aDraft);
    expect(a).not.toContain(P.bDraft);
    const b = await ids(v.focalB);
    expect(b).not.toContain(P.aDraft);
    expect(b).not.toContain(P.aWithdrawn);
  });

  it("shows nothing without an active account", async () => {
    expect(v.pending).toBeNull();
    expect(await ids(null)).toEqual([]);
    expect(await ids(v.pending)).toEqual([]);
    expect((await pipelineFacets(null)).total).toBe(0);
  });

  it("filters by country, sector, PPP model, stage, size and search", async () => {
    const investor = v.investor;
    expect(fixtures(await ids(investor, { country: ISO.a }))).toEqual([P.aPub]);
    expect(fixtures(await ids(investor, { country: ISO.b }))).toEqual([P.bPub]);
    expect(
      fixtures(await ids(investor, { sector: "Integration reuse" })),
    ).toEqual([P.aPub, P.bPub].sort());
    expect(fixtures(await ids(investor, { size: "lt50" }))).toEqual([P.aPub]);
    expect(fixtures(await ids(investor, { size: "50-100" }))).toEqual([P.aPub]);
    expect(fixtures(await ids(investor, { size: "gte250" }))).toEqual([P.bPub]);
    expect(fixtures(await ids(investor, { size: "100-250" }))).toEqual([]);
    expect(fixtures(await ids(investor, { q: "bravo" }))).toEqual([P.bPub]);
    expect(
      fixtures(await ids(investor, { q: "integration pipeline a" })),
    ).toEqual([P.aPub]);
    expect(
      fixtures(
        await ids(investor, {
          country: ISO.a,
          ppp: "Integration concession",
          stage: "Integration concept",
        }),
      ),
    ).toEqual([P.aPub]);
  });

  it("never widens visibility, whatever the filter values", async () => {
    const probes: PipelineFilters[] = [
      { q: SECRET.title },
      { q: "Zephyr" },
      { ppp: SECRET.ppp },
      { stage: SECRET.stage },
      { sector: SECRET.sector },
      { country: ISO.x },
      { country: ISO.b, q: SECRET.title },
      { size: "gte250", sector: SECRET.sector },
    ];
    for (const [who, viewer] of signedIn()) {
      const all = await ids(viewer);
      for (const filters of probes) {
        const found = await ids(viewer, filters);
        for (const id of found) expect(all, who).toContain(id);
        for (const id of HIDDEN) expect(found, who).not.toContain(id);
      }
    }
  });

  it("offers filter options from visible projects only", async () => {
    for (const [, viewer] of signedIn()) {
      const facets = await pipelineFacets(viewer);
      expect(facets.pppModels).not.toContain(SECRET.ppp);
      expect(facets.stages).not.toContain(SECRET.stage);
      expect(facets.sectors).not.toContain(SECRET.sector);
      expect(facets.countries.map((c) => c.iso3)).not.toContain(ISO.x);
    }
    const investor = await pipelineFacets(v.investor);
    expect(investor.countries.map((c) => c.iso3)).toEqual(
      expect.arrayContaining([ISO.a, ISO.b]),
    );
    expect(investor.pppModels).toContain("Integration concession");
  });
});

describe("pipeline project page", () => {
  it("is not found for drafts, withdrawn projects and inactive countries, for every role", async () => {
    for (const [who, viewer] of signedIn()) {
      for (const id of HIDDEN) {
        expect(await getPipelineProject(viewer, id, { meta }), who).toBeNull();
      }
      expect(
        await getPipelineProject(viewer, "it-pipe-missing", { meta }),
      ).toBeNull();
    }
    expect(await getPipelineProject(null, P.aPub, { meta })).toBeNull();
    expect(await getPipelineProject(v.pending, P.aPub, { meta })).toBeNull();
  });

  it("shows the current teaser only, with download as the country set it", async () => {
    const a = await getPipelineProject(v.investor, P.aPub, { meta });
    expect(a?.project.title).toBe("Alpha reuse scheme");
    expect(a?.project.sizeMinUsd).toBe(40_000_000);
    expect(a?.teaser).toMatchObject({
      id: D.aV2,
      version: 2,
      fileType: "pdf",
      canOpen: true,
      canDownload: false,
    });
    expect(JSON.stringify(a)).not.toContain("blobKey");
    expect(JSON.stringify(a)).not.toContain("it/");

    const b = await getPipelineProject(v.investor, P.bPub, { meta });
    expect(b?.teaser).toMatchObject({ id: D.bTeaser, canDownload: true });

    // The owning country may always download its own teaser.
    const own = await getPipelineProject(v.focalA, P.aPub, { meta });
    expect(own?.teaser).toMatchObject({ id: D.aV2, canDownload: true });
  });

  it("audits each project view", async () => {
    const viewer = v.investor;
    if (!viewer) throw new Error("investor viewer missing");
    await getPipelineProject(viewer, P.bPub, { meta });
    const event = await db.auditEvent.findFirst({
      where: { actorId: viewer.id, action: "project.view", entityId: P.bPub },
      orderBy: { at: "desc" },
    });
    expect(event?.entityType).toBe("Project");
    expect(event?.metadata).toMatchObject({
      source: "pipeline",
      teaserId: D.bTeaser,
    });
  });
});
