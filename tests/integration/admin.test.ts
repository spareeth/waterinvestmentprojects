// M7 (PLAN v0.3 F7): the admin console against real PostgreSQL. Only admins reach any admin function (every
// other viewer is refused and nothing is written); the metadata import changes only the three filters of the
// matched projects; contacts link only to accounts of the same country; bulk accounts never leave a temporary
// password in the database or the audit trail; the per-country export holds nothing from another country.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Route handlers call connection() (no prerendering), which needs a Next.js request scope the tests do not have.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

import {
  CountryContactRole,
  CountryStatus,
  DocumentKind,
  MembershipRole,
  ProjectStatus,
  ScanStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { GET as exportRoute } from "@/app/(portal)/admin/exports/[file]/route";
import { GET as countryExportRoute } from "@/app/(portal)/admin/exports/country/[iso3]/route";
import {
  applyBulkAccounts,
  previewBulkAccounts,
  setAccountStatus,
} from "@/lib/admin/accounts";
import {
  addContact,
  applyContactsImport,
  createCountry,
  getAdminCountry,
  listAdminCountries,
  previewContactsImport,
  removeContact,
  setCountryStatus,
  updateContact,
} from "@/lib/admin/countries";
import { AdminError } from "@/lib/admin/errors";
import {
  exportAccountsCsv,
  exportAuditCsv,
  exportContactsCsv,
  exportCountryZip,
  exportProjectsCsv,
  exportSubmissionsCsv,
} from "@/lib/admin/exports";
import {
  applyMetadataImport,
  getAdminOverview,
  listAdminProjects,
  previewMetadataImport,
  publishProjects,
  unpublishProject,
} from "@/lib/admin/projects";
import { TEMPORARY_PASSWORD_PATTERN } from "@/lib/auth/temporary-password";
import { meetingRequestWhere, projectWhere } from "@/lib/authz";
import type { Viewer } from "@/lib/authz/viewer";
import { db } from "@/lib/db";
import { LocalBlobStore } from "@/lib/storage";
import {
  cleanUp,
  createUser,
  gatePasswordOnly,
  IT_DOMAIN,
  testAuth,
  uniqueEmail,
  viewerFor,
} from "./helpers";

const auth = testAuth();
const meta = { ip: "198.51.100.9", userAgent: "integration-test" };
const C = { a: "it-adm-a", b: "it-adm-b" } as const;
const ISO = { a: "XQA", b: "XQB" } as const;
const P = {
  aDraft: "it-adm-p-a-draft",
  aPub: "it-adm-p-a-pub",
  bDraft: "it-adm-p-b-draft",
  bPub: "it-adm-p-b-pub",
} as const;
const NEW_COUNTRY_ISO = "XQN";

let blobDir: string;
let store: LocalBlobStore;
let summitAdmin: Viewer;
let platformAdmin: Viewer;
let investor: Viewer;
let focalA: Viewer;
let coordinatorA: Viewer;
let investorId: string;
let platformAdminId: string;
let focalAEmail: string;

async function viewer(userId: string): Promise<Viewer> {
  const v = await viewerFor(userId, gatePasswordOnly);
  if (!v) throw new Error("expected an active viewer");
  return v;
}

/** Project with a submission and one teaser version (file in the test store). */
async function seedProject(input: {
  id: string;
  countryId: string;
  title: string;
  status: ProjectStatus;
  scanStatus?: ScanStatus | null;
}) {
  const submission = await db.submission.create({
    data: {
      countryId: input.countryId,
      uploaderName: "Fictional Uploader",
      uploaderEmail: `uploader-${input.id}@${IT_DOMAIN}`,
      ackTextVersion: "country-upload-ack-v1",
      ackAcceptedAt: new Date(),
    },
  });
  await db.project.create({
    data: {
      id: input.id,
      countryId: input.countryId,
      submissionId: submission.id,
      title: input.title,
      sector: "Desalination",
      status: input.status,
      publishedAt: input.status === ProjectStatus.PUBLISHED ? new Date() : null,
      sizeMinUsd: "100000000",
      sizeMaxUsd: "200000000",
    },
  });
  if (input.scanStatus === null) return;
  const blobKey = `submissions/${input.id}/teaser.pdf`;
  const bytes = new TextEncoder().encode(`%PDF-1.4 teaser of ${input.title}`);
  await store.put(blobKey, bytes);
  await db.document.create({
    data: {
      projectId: input.id,
      submissionId: submission.id,
      kind: DocumentKind.TEASER,
      filename: `${input.id}.pdf`,
      blobKey,
      sha256: "0".repeat(64),
      sizeBytes: bytes.byteLength,
      scanStatus: input.scanStatus ?? ScanStatus.CLEAN,
    },
  });
}

async function counts() {
  const [countries, contacts, users, projects, audit] = await Promise.all([
    db.country.count(),
    db.countryContact.count(),
    db.user.count(),
    db.project.findMany({
      where: { id: { in: Object.values(P) } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        pppModel: true,
        sizeMinUsd: true,
        developmentStage: true,
        updatedAt: true,
      },
    }),
    db.auditEvent.count(),
  ]);
  return {
    countries,
    contacts,
    users,
    projects: JSON.stringify(projects),
    audit,
  };
}

function readZipNames(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const endAt = zip.byteLength - 22;
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i += 1) {
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      zip.slice(at + 46, at + 46 + nameLength),
    );
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true);
    const data = zip.slice(dataAt, dataAt + size);
    expect(crc32(data) >>> 0).toBe(crc);
    files.set(name, data);
    at += 46 + nameLength;
  }
  return files;
}

beforeAll(async () => {
  await cleanUp();
  await db.country.deleteMany({ where: { iso3: NEW_COUNTRY_ISO } });
  blobDir = await mkdtemp(path.join(tmpdir(), "it-admin-blobs-"));
  store = new LocalBlobStore(blobDir);
  await db.country.createMany({
    data: [
      { id: C.a, name: "Integration Admin Country A", iso3: ISO.a },
      { id: C.b, name: "Integration Admin Country B", iso3: ISO.b },
    ],
  });
  await seedProject({
    id: P.aDraft,
    countryId: C.a,
    title: "Alpha Draft Plant",
    status: ProjectStatus.DRAFT,
  });
  await seedProject({
    id: P.aPub,
    countryId: C.a,
    title: '=HYPERLINK("http://evil.example")',
    status: ProjectStatus.PUBLISHED,
  });
  await seedProject({
    id: P.bDraft,
    countryId: C.b,
    title: "Bravo Secret Draft",
    status: ProjectStatus.DRAFT,
    scanStatus: null,
  });
  await seedProject({
    id: P.bPub,
    countryId: C.b,
    title: "Bravo Published Works",
    status: ProjectStatus.PUBLISHED,
  });

  const summit = await createUser({
    role: UserRole.SUMMIT_ADMIN,
    termsAccepted: true,
  });
  const platform = await createUser({
    role: UserRole.PLATFORM_ADMIN,
    termsAccepted: true,
  });
  const inv = await createUser({
    role: UserRole.INVESTOR,
    termsAccepted: true,
  });
  const focal = await createUser({
    role: UserRole.COUNTRY,
    termsAccepted: true,
    membershipRole: MembershipRole.FOCAL_POINT,
    countryId: C.a,
  });
  const coord = await createUser({
    role: UserRole.WBG_COORDINATOR,
    termsAccepted: true,
    membershipRole: MembershipRole.MEMBER,
    countryId: C.a,
  });
  summitAdmin = await viewer(summit.id);
  platformAdmin = await viewer(platform.id);
  platformAdminId = platform.id;
  investor = await viewer(inv.id);
  investorId = inv.id;
  focalA = await viewer(focal.id);
  focalAEmail = focal.email;
  coordinatorA = await viewer(coord.id);
});

afterAll(async () => {
  await db.country.deleteMany({ where: { iso3: NEW_COUNTRY_ISO } });
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("default deny: only admins reach the admin console", () => {
  const outsiders = () =>
    [
      ["no viewer", null as unknown as Viewer],
      ["investor", investor],
      ["country focal point", focalA],
      ["WBG coordinator", coordinatorA],
    ] as const;

  it("refuses every admin function and writes nothing", async () => {
    const contact = await addContact(
      summitAdmin,
      C.a,
      {
        name: "Fictional Contact",
        email: `deny-${Date.now()}@${IT_DOMAIN}`,
        role: CountryContactRole.FOCAL_POINT,
      },
      { meta },
    );
    const before = await counts();
    const csv = `project_id,ppp_model\n${P.aDraft},Lease`;
    for (const [label, v] of outsiders()) {
      const calls: [string, () => Promise<unknown>][] = [
        ["listAdminProjects", () => listAdminProjects(v)],
        ["getAdminOverview", () => getAdminOverview(v)],
        ["previewMetadataImport", () => previewMetadataImport(v, csv)],
        [
          "applyMetadataImport",
          () => applyMetadataImport(v, csv, "0".repeat(64), { meta }),
        ],
        ["publishProjects", () => publishProjects(v, [P.aDraft], { meta })],
        ["unpublishProject", () => unpublishProject(v, P.aPub, { meta })],
        ["listAdminCountries", () => listAdminCountries(v)],
        ["getAdminCountry", () => getAdminCountry(v, C.a)],
        [
          "createCountry",
          () =>
            createCountry(
              v,
              { name: "Nowhere Land", iso3: NEW_COUNTRY_ISO },
              { meta },
            ),
        ],
        [
          "setCountryStatus",
          () => setCountryStatus(v, C.b, CountryStatus.INACTIVE, { meta }),
        ],
        [
          "addContact",
          () =>
            addContact(
              v,
              C.b,
              {
                name: "Sneaky One",
                email: `sneaky@${IT_DOMAIN}`,
                role: CountryContactRole.FOCAL_POINT,
              },
              { meta },
            ),
        ],
        [
          "updateContact",
          () =>
            updateContact(
              v,
              contact.id,
              {
                name: "Changed",
                email: `changed@${IT_DOMAIN}`,
                role: CountryContactRole.FOCAL_POINT,
              },
              { meta },
            ),
        ],
        ["removeContact", () => removeContact(v, contact.id, { meta })],
        [
          "previewContactsImport",
          () =>
            previewContactsImport(
              v,
              `iso3,name,email,role\n${ISO.b},X Y,x@${IT_DOMAIN},focal point`,
            ),
        ],
        [
          "applyContactsImport",
          () =>
            applyContactsImport(v, "iso3,name,email,role", "0".repeat(64), {
              meta,
            }),
        ],
        [
          "previewBulkAccounts",
          () =>
            previewBulkAccounts(
              v,
              `email,name,role\nx@${IT_DOMAIN},X Y,investor`,
            ),
        ],
        [
          "applyBulkAccounts",
          () =>
            applyBulkAccounts(v, "email,name,role", "0".repeat(64), {
              meta,
              auth,
            }),
        ],
        [
          "setAccountStatus",
          () =>
            setAccountStatus(v, investorId, UserStatus.DEACTIVATED, { meta }),
        ],
        ["exportProjectsCsv", () => exportProjectsCsv(v, { meta })],
        ["exportSubmissionsCsv", () => exportSubmissionsCsv(v, { meta })],
        ["exportAccountsCsv", () => exportAccountsCsv(v, { meta })],
        ["exportContactsCsv", () => exportContactsCsv(v, { meta })],
        ["exportAuditCsv", () => exportAuditCsv(v, { meta })],
        ["exportCountryZip", () => exportCountryZip(v, ISO.a, { meta, store })],
      ];
      for (const [name, call] of calls) {
        await expect(call(), `${label}: ${name}`).rejects.toSatisfy(
          (e) => e instanceof AdminError && e.code === "forbidden",
        );
      }
    }
    expect(await counts()).toEqual(before);
    await removeContact(summitAdmin, contact.id, { meta });
  });

  it("answers the export routes with 404 without an admin session", async () => {
    for (const file of [
      "projects.csv",
      "accounts.csv",
      "audit.csv",
      "nothing.csv",
      "__proto__",
    ]) {
      const res = await exportRoute(
        new Request(`http://localhost/admin/exports/${file}`),
        {
          params: Promise.resolve({ file }),
        },
      );
      expect(res.status).toBe(404);
    }
    const res = await countryExportRoute(
      new Request("http://localhost/admin/exports/country/XQA"),
      {
        params: Promise.resolve({ iso3: ISO.a }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("keeps the audit log export for platform admins", async () => {
    await expect(exportAuditCsv(summitAdmin, { meta })).rejects.toBeInstanceOf(
      AdminError,
    );
    const { csv } = await exportAuditCsv(platformAdmin, { meta });
    expect(csv.split("\r\n")[0]).toContain("at_utc,action,actor_email");
  });
});

describe("metadata import", () => {
  it("changes only PPP model, size and stage of the matched projects, audited", async () => {
    const before = await db.project.findMany({
      where: { id: { in: Object.values(P) } },
      orderBy: { id: "asc" },
    });
    const csv = [
      "project_id,title,sector,status,region,ppp_model,size_min_usd_million,size_max_usd_million,development_stage",
      `${P.aDraft},Renamed!,Energy,PUBLISHED,North coast,dbo,,250,feasibility in progress`,
      `${P.bPub},,,,,-,,,`,
      `it-adm-unknown,,,,,Affermage,,,`,
    ].join("\n");
    const { plan, digest } = await previewMetadataImport(summitAdmin, csv);
    expect(plan.summary).toMatchObject({ changes: 1, unchanged: 1, errors: 1 });
    // P.bPub has no PPP model, so "-" changes nothing.
    const result = await applyMetadataImport(summitAdmin, csv, digest, {
      meta,
    });
    expect(result.changed).toBe(1);

    const after = await db.project.findMany({
      where: { id: { in: Object.values(P) } },
      orderBy: { id: "asc" },
    });
    for (const [i, p] of after.entries()) {
      const old = before[i];
      expect(p.title).toBe(old.title);
      expect(p.sector).toBe(old.sector);
      expect(p.status).toBe(old.status);
      expect(p.countryId).toBe(old.countryId);
      if (p.id !== P.aDraft) expect(p.updatedAt).toEqual(old.updatedAt);
    }
    const a = after.find((p) => p.id === P.aDraft)!;
    // WBG list spelling (PLAN v0.4 0b.8) and the region (M11).
    expect(a.region).toBe("North coast");
    expect(a.pppModel).toBe("DBO");
    expect(a.sizeMinUsd?.toString()).toBe("100000000");
    expect(a.sizeMaxUsd?.toString()).toBe("250000000");
    expect(a.developmentStage).toBe("Feasibility in progress");

    const events = await db.auditEvent.findMany({
      where: {
        actorId: summitAdmin.id,
        action: { in: ["project.update", "project_metadata.import"] },
      },
    });
    expect(events.map((e) => e.action).sort()).toEqual([
      "project.update",
      "project_metadata.import",
    ]);
    expect(
      events.find((e) => e.action === "project.update")?.metadata,
    ).toMatchObject({
      source: "csv_import",
      changed: ["region", "pppModel", "sizeMaxUsd", "developmentStage"],
    });
  });

  it("refuses to apply when the projects changed since the preview", async () => {
    const csv = `project_id,development_stage\n${P.aDraft},Procurement`;
    const { digest } = await previewMetadataImport(summitAdmin, csv);
    await db.project.update({
      where: { id: P.aDraft },
      data: { pppModel: "Lease" },
    });
    await expect(
      applyMetadataImport(summitAdmin, csv, digest, { meta }),
    ).rejects.toSatisfy((e) => e instanceof AdminError && e.code === "stale");
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: P.aDraft } }))
        .developmentStage,
    ).toBe("Feasibility in progress");
  });
});

describe("publishing from the admin overview", () => {
  it("publishes what is ready and reports the rest", async () => {
    const results = await publishProjects(summitAdmin, [P.aDraft, P.bDraft], {
      meta,
    });
    expect(results).toEqual([
      { projectId: P.aDraft, ok: true },
      { projectId: P.bDraft, ok: false, error: "no_clean_teaser" },
    ]);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: P.aDraft } })).status,
    ).toBe(ProjectStatus.PUBLISHED);
    await unpublishProject(summitAdmin, P.aDraft, { meta });
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: P.aDraft } })).status,
    ).toBe(ProjectStatus.WITHDRAWN);
    const rows = await listAdminProjects(summitAdmin, { countryId: C.b });
    expect(rows.map((r) => r.id).sort()).toEqual([P.bDraft, P.bPub]);
  });
});

describe("countries and contacts", () => {
  it("creates countries once and switching one off hides its projects from investors", async () => {
    await createCountry(
      summitAdmin,
      { name: "Integration Newland", iso3: NEW_COUNTRY_ISO },
      { meta },
    );
    await expect(
      createCountry(
        summitAdmin,
        { name: "Integration Newland", iso3: NEW_COUNTRY_ISO },
        { meta },
      ),
    ).rejects.toSatisfy((e) => e instanceof AdminError && e.code === "exists");

    const visible = () =>
      db.project.count({
        where: { AND: [projectWhere(investor), { id: P.bPub }] },
      });
    expect(await visible()).toBe(1);
    await setCountryStatus(summitAdmin, C.b, CountryStatus.INACTIVE, { meta });
    expect(await visible()).toBe(0);
    await setCountryStatus(summitAdmin, C.b, CountryStatus.ACTIVE, { meta });
    expect(await visible()).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          entityId: C.b,
          action: { in: ["country.activate", "country.deactivate"] },
        },
      }),
    ).toBe(2);
  });

  it("links a contact only to an account of the same country and role", async () => {
    const inA = await addContact(
      summitAdmin,
      C.a,
      {
        name: "Focal Of A",
        email: focalAEmail,
        role: CountryContactRole.FOCAL_POINT,
      },
      { meta },
    );
    expect(inA.linked).toBe(true);
    // Same person named for country B, where they have no account: no link, so no access to B either.
    const inB = await addContact(
      summitAdmin,
      C.b,
      {
        name: "Focal Of A",
        email: focalAEmail,
        role: CountryContactRole.FOCAL_POINT,
      },
      { meta },
    );
    expect(inB.linked).toBe(false);
    // Same email as WBG coordinator of A: the account is a country focal point, so no link either.
    const asCoordinator = await addContact(
      summitAdmin,
      C.a,
      {
        name: "Focal Of A",
        email: focalAEmail,
        role: CountryContactRole.WBG_COORDINATOR,
      },
      { meta },
    );
    expect(asCoordinator.linked).toBe(false);
    await expect(
      addContact(
        summitAdmin,
        C.a,
        {
          name: "Again",
          email: focalAEmail,
          role: CountryContactRole.FOCAL_POINT,
        },
        { meta },
      ),
    ).rejects.toSatisfy((e) => e instanceof AdminError && e.code === "exists");
    // A contact gives no access: the focal point of A still sees nothing of B beyond the published pipeline (M12).
    expect(
      await db.project.count({
        where: {
          AND: [
            projectWhere(focalA),
            { countryId: C.b },
            { status: { not: ProjectStatus.PUBLISHED } },
          ],
        },
      }),
    ).toBe(0);
    expect(
      await db.meetingRequest.count({
        where: {
          AND: [meetingRequestWhere(focalA), { project: { countryId: C.b } }],
        },
      }),
    ).toBe(0);

    const changed = await updateContact(
      summitAdmin,
      inB.id,
      {
        name: "Focal Of B",
        email: `focal-b@${IT_DOMAIN}`,
        role: CountryContactRole.FOCAL_POINT,
      },
      { meta },
    );
    expect(changed).toEqual(["name", "email"]);
    await removeContact(summitAdmin, asCoordinator.id, { meta });
    const country = await getAdminCountry(summitAdmin, C.a);
    expect(country?.contacts.map((c) => c.role)).toEqual([
      CountryContactRole.FOCAL_POINT,
    ]);
    expect(
      await db.auditEvent.count({
        where: {
          actorId: summitAdmin.id,
          action: {
            in: [
              "country_contact.create",
              "country_contact.update",
              "country_contact.delete",
            ],
          },
        },
      }),
    ).toBeGreaterThanOrEqual(5);
  });

  it("imports contacts from a CSV, skipping stored ones", async () => {
    const csv = [
      "iso3,name,email,role",
      `${ISO.a},Focal Of A,${focalAEmail},focal point`,
      `${ISO.b},Coordinator Bee,coord-b@${IT_DOMAIN},WBG coordinator`,
      `ZZZ,Nobody,nobody@${IT_DOMAIN},focal point`,
    ].join("\n");
    const { plan, digest } = await previewContactsImport(summitAdmin, csv);
    expect(plan.summary).toEqual({ rows: 3, ready: 1, existing: 1, errors: 1 });
    const result = await applyContactsImport(summitAdmin, csv, digest, {
      meta,
    });
    expect(result).toEqual({ created: 1, linked: 0 });
    await expect(
      applyContactsImport(summitAdmin, csv, digest, { meta }),
    ).rejects.toSatisfy((e) => e instanceof AdminError && e.code === "stale");
  });
});

describe("bulk accounts and switching accounts off", () => {
  it("creates accounts, returns each temporary password once and stores none of them", async () => {
    const a = uniqueEmail("bulk-investor");
    const b = uniqueEmail("bulk-focal");
    const csv = [
      "email,name,organisation,job_title,role,countries",
      `${a},Bulk Investor,Fictional Fund,Partner,investor,`,
      `${b},Bulk Focal,,,focal point,${ISO.b}`,
      `${uniqueEmail("bulk-platform")},Bulk Platform,,,platform admin,`,
    ].join("\n");
    const { plan, digest } = await previewBulkAccounts(summitAdmin, csv);
    expect(plan.summary).toEqual({ rows: 3, ready: 2, errors: 1 });
    const result = await applyBulkAccounts(summitAdmin, csv, digest, {
      meta,
      auth,
    });
    expect(result.failed).toEqual([]);
    expect(result.created.map((c) => c.email).sort()).toEqual([a, b].sort());
    for (const c of result.created) {
      expect(c.temporaryPassword).toMatch(TEMPORARY_PASSWORD_PATTERN);
    }

    const users = await db.user.findMany({
      where: { email: { in: [a, b] } },
      select: {
        id: true,
        email: true,
        mustChangePassword: true,
        memberships: { select: { countryId: true } },
      },
    });
    // M12: the investor must choose their own password; the country focal point keeps the handed-out one.
    expect(
      Object.fromEntries(users.map((u) => [u.email, u.mustChangePassword])),
    ).toEqual({ [a]: true, [b]: false });
    expect(users.flatMap((u) => u.memberships.map((m) => m.countryId))).toEqual(
      [C.b],
    );

    const passwords = result.created.map((c) => c.temporaryPassword);
    const stored = await db.account.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    for (const row of stored) {
      expect(passwords).not.toContain(row.password);
    }
    const audit = JSON.stringify(
      await db.auditEvent.findMany({ where: { actorId: summitAdmin.id } }),
    );
    for (const p of passwords) expect(audit).not.toContain(p);
    const summary = await db.auditEvent.findFirst({
      where: { actorId: summitAdmin.id, action: "user.bulk_create" },
    });
    expect(summary?.metadata).toMatchObject({
      created: 2,
      skippedWithErrors: 1,
    });

    // The accounts export has no secrets and guards formulas.
    const { csv: accounts } = await exportAccountsCsv(summitAdmin, { meta });
    expect(accounts.split("\r\n")[0]).not.toMatch(
      /password_hash|token|secret/i,
    );
    for (const p of passwords) expect(accounts).not.toContain(p);
  });

  it("switches an account off and on, within the admin's reach only", async () => {
    await setAccountStatus(summitAdmin, investorId, UserStatus.DEACTIVATED, {
      meta,
    });
    expect(await viewerFor(investorId, gatePasswordOnly)).toBeNull();
    await setAccountStatus(summitAdmin, investorId, UserStatus.ACTIVE, {
      meta,
    });
    expect(await viewerFor(investorId, gatePasswordOnly)).not.toBeNull();
    await expect(
      setAccountStatus(summitAdmin, platformAdminId, UserStatus.DEACTIVATED, {
        meta,
      }),
    ).rejects.toSatisfy(
      (e) => e instanceof AdminError && e.code === "forbidden",
    );
    await expect(
      setAccountStatus(summitAdmin, summitAdmin.id, UserStatus.DEACTIVATED, {
        meta,
      }),
    ).rejects.toSatisfy(
      (e) => e instanceof AdminError && e.code === "forbidden",
    );
    expect(
      await db.auditEvent.count({
        where: {
          entityId: investorId,
          action: { in: ["user.deactivate", "user.reactivate"] },
        },
      }),
    ).toBe(2);
  });
});

describe("exports", () => {
  it("guards spreadsheet formulas in the projects export", async () => {
    const { csv } = await exportProjectsCsv(summitAdmin, { meta });
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("puts only that country's data and files in the country ZIP", async () => {
    const result = await exportCountryZip(summitAdmin, ISO.a, { meta, store });
    expect(result).not.toBeNull();
    const files = readZipNames(result!.zip);
    expect([...files.keys()].slice(0, 5)).toEqual([
      "README.txt",
      "projects.csv",
      "submissions.csv",
      "contacts.csv",
      "meeting-requests.csv",
    ]);
    const all = [...files.entries()]
      .map(([name, data]) => `${name}\n${new TextDecoder().decode(data)}`)
      .join("\n");
    expect(all).toContain("Alpha Draft Plant");
    expect(all).toContain(`${P.aDraft}.pdf`);
    expect(all).not.toContain("Bravo");
    expect(all).not.toContain(P.bPub);
    expect(all).not.toContain("coord-b@");
    const teasers = [...files.keys()].filter((n) => n.startsWith("teasers/"));
    expect(teasers).toHaveLength(2);
    expect(
      await exportCountryZip(summitAdmin, "QQQ", { meta, store }),
    ).toBeNull();
    expect(
      await db.auditEvent.count({
        where: { action: "export.country", entityId: C.a },
      }),
    ).toBe(1);
  });
});
