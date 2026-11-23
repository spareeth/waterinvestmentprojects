// 23 Nov, against real PostgreSQL: deleting a project and removing an account.
// - Projects: admins delete any project, the uploader only their own unpublished project. A delete
//   removes the project, its teaser documents and files and its meeting requests (open ones are cancelled first,
//   slots freed, everyone told), keeps the consent submission, and is audited. Other countries, coordinators and
//   investors are refused, and nothing changes for them.
// - Accounts: admins remove others' accounts (never their own, Summit admins not platform admins). The account is
//   erased and disabled, its open requests cancelled and its country access removed; the email can be reused.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MeetingRequestStatus,
  MembershipRole,
  ProjectType,
  SlotStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { AdminError } from "@/lib/admin/errors";
import { removedEmail, removeUser } from "@/lib/admin/accounts";
import { listAccounts } from "@/lib/auth/accounts";
import type { Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { MemoryMailer } from "@/lib/mail";
import { MEETING_ROOMS, uaeTime } from "@/lib/meetings/schedule";
import { ensureSchedule } from "@/lib/meetings/slots";
import {
  createMeetingRequest,
  decideMeetingRequest,
  REQUEST_AUDIT,
  type RequestOptions,
} from "@/lib/requests/service";
import { LocalBlobStore } from "@/lib/storage";
import { submitWorkspaceTeasers } from "@/lib/submission/service";
import type { ProjectInput } from "@/lib/workspace/project-input";
import {
  createProject,
  deleteProject,
  publishProject,
  uploadTeaser,
  WORKSPACE_AUDIT,
  WorkspaceError,
  type WorkspaceOptions,
} from "@/lib/workspace/service";
import { cleanUp, createUser, uniqueEmail, viewerFor } from "./helpers";

const C = { a: "it-del-a", b: "it-del-b" } as const;
const NOW = new Date("2026-11-25T08:00:00Z");
const T1 = uaeTime("2026-12-10", "11:00");
const T2 = uaeTime("2026-12-10", "11:30");
const ROOM1 = MEETING_ROOMS[0].name;

type Key =
  | "platform"
  | "admin"
  | "focalA"
  | "memberA"
  | "focalB"
  | "coordA"
  | "investor"
  | "investor2";
const v = {} as Record<Key, Viewer>;
const ids = {} as Record<Key, string>;
let blobDir: string;
let store: LocalBlobStore;
let opts: WorkspaceOptions;

const input = (title: string): ProjectInput => ({
  title,
  sector: "Water supply",
  region: null,
  projectType: ProjectType.SUMMIT_PIPELINE,
  pppModel: null,
  sizeMinUsd: null,
  sizeMaxUsd: null,
  developmentStage: null,
});

const pdf = (label: string) => ({
  name: `${label}.pdf`,
  bytes: new TextEncoder().encode(`%PDF-1.7\n% ${label}\n%%EOF\n`),
});

function requestOpts(extra: Partial<RequestOptions> = {}): RequestOptions {
  return {
    now: NOW,
    mailer: new MemoryMailer(),
    notify: { focalPoints: false, investor: false },
    summitRecipients: ["summit-team@it.example"],
    ...extra,
  };
}

const requestInput = (at: Date, name: string) => ({
  contactName: name,
  contactEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@it.example`,
  organisation: "Fictional Delete Fund",
  role: "Partner",
  note: "",
  slotStartsAt: at,
  slotRoom: ROOM1,
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WorkspaceError || error instanceof AdminError) {
      return error.code;
    }
    throw error;
  }
  return "allowed";
}

async function blobCount(): Promise<number> {
  const files = await readdir(blobDir, {
    recursive: true,
    withFileTypes: true,
  });
  return files.filter((f) => f.isFile()).length;
}

/** A project of country A with one clean PDF teaser, as a draft or published. */
async function projectWithTeaser(title: string, publish = false) {
  const id = await createProject(v.admin, C.a, input(title), opts);
  await uploadTeaser(
    v.admin,
    id,
    pdf(title),
    { allowDownload: true },
    { acknowledged: true },
    opts,
  );
  if (publish) await publishProject(v.admin, id, opts);
  return id;
}

async function freeTestTimes() {
  await db.slot.updateMany({
    where: { startsAt: { in: [T1, T2] } },
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
  await freeTestTimes();
  blobDir = await mkdtemp(path.join(tmpdir(), "it-del-blobs-"));
  store = new LocalBlobStore(blobDir);
  opts = { store, scanMode: "assume-clean" };
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Delete A", iso3: "XDA" },
      { id: C.b, name: "IT Delete B", iso3: "XDB" },
    ],
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
    ids[key] = u.id;
    v[key] = (await viewerFor(u.id))!;
    return u;
  };
  await make("platform", UserRole.PLATFORM_ADMIN);
  await make("admin", UserRole.SUMMIT_ADMIN);
  const focalA = await make(
    "focalA",
    UserRole.COUNTRY,
    MembershipRole.FOCAL_POINT,
    C.a,
  );
  await make("memberA", UserRole.COUNTRY, MembershipRole.MEMBER, C.a);
  await make("focalB", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  await make("coordA", UserRole.WBG_COORDINATOR, MembershipRole.MEMBER, C.a);
  await make("investor", UserRole.INVESTOR);
  await make("investor2", UserRole.INVESTOR);
  await db.countryContact.create({
    data: {
      countryId: C.a,
      name: "Delete Focal",
      email: focalA.email,
      role: "FOCAL_POINT",
      userId: focalA.id,
    },
  });
});

afterAll(async () => {
  await freeTestTimes();
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("deleting projects", () => {
  it("lets the uploader delete their own draft: project, documents and files go, the consent stays", async () => {
    // memberA uploads the draft from My projects; focalA (same country, not the uploader) may not delete it.
    const receipt = await submitWorkspaceTeasers(
      v.memberA,
      {
        uploaderName: "Mo Member",
        uploaderEmail: "mo.member@it.example",
        uploaderJobTitle: "Engineer",
        governmentOrganisation: "Ministry of Fictional Water",
        acknowledged: true,
        teasers: [{ sector: "Water supply", file: pdf("IT delete draft") }],
      },
      { ...opts, mailer: new MemoryMailer() },
    );
    const id = receipt.projectIds[0];
    await db.project.update({
      where: { id },
      data: { title: "IT delete draft" },
    });
    const submissionId = (
      await db.document.findFirstOrThrow({ where: { projectId: id } })
    ).submissionId;
    const blobsBefore = await blobCount();

    expect(await refusal(deleteProject(v.focalA, id, opts))).toBe("forbidden");
    expect(await db.project.findUnique({ where: { id } })).not.toBeNull();

    await deleteProject(v.memberA, id, opts);

    expect(await db.project.findUnique({ where: { id } })).toBeNull();
    expect(await db.document.count({ where: { projectId: id } })).toBe(0);
    expect(await blobCount()).toBe(blobsBefore - 1);
    expect(
      await db.submission.findUnique({ where: { id: submissionId } }),
    ).not.toBeNull();
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: WORKSPACE_AUDIT.PROJECT_DELETE, entityId: id },
    });
    expect(audit.actorId).toBe(ids.memberA);
    expect(audit.metadata).toMatchObject({
      title: "IT delete draft",
      countryId: C.a,
      documentsDeleted: 1,
    });
  });

  it("refuses a country user a published project, and refuses other countries, coordinators and investors anything", async () => {
    const published = await projectWithTeaser("IT delete published", true);
    const draft = await projectWithTeaser("IT delete other draft");
    expect(await refusal(deleteProject(v.focalA, published, opts))).toBe(
      "delete_published",
    );
    for (const key of ["focalB", "coordA", "investor"] as const) {
      for (const id of [published, draft]) {
        expect(await refusal(deleteProject(v[key], id, opts)), key).toBe(
          "not_found",
        );
      }
    }
    expect(
      await db.project.count({ where: { id: { in: [published, draft] } } }),
    ).toBe(2);
    expect(
      await db.auditEvent.count({
        where: {
          action: WORKSPACE_AUDIT.PROJECT_DELETE,
          entityId: { in: [published, draft] },
        },
      }),
    ).toBe(0);
    // The admin deletes both.
    await deleteProject(v.admin, published, opts);
    await deleteProject(v.admin, draft, opts);
    expect(
      await db.project.count({ where: { id: { in: [published, draft] } } }),
    ).toBe(0);
  });

  it("lets an admin delete a published project with meeting requests: open ones are cancelled and everyone is told", async () => {
    const id = await projectWithTeaser("IT delete with requests", true);
    const open = await createMeetingRequest(
      v.investor,
      id,
      requestInput(T1, "Ivy Deleted"),
      requestOpts(),
    );
    const declined = await createMeetingRequest(
      v.investor2,
      id,
      requestInput(T2, "Bo Declined"),
      requestOpts(),
    );
    await decideMeetingRequest(
      v.focalA,
      declined.id,
      MeetingRequestStatus.DECLINED,
      requestOpts(),
    );
    expect(
      (await db.slot.findFirstOrThrow({ where: { meetingRequestId: open.id } }))
        .status,
    ).toBe(SlotStatus.HELD);

    const mailer = new MemoryMailer();
    await deleteProject(v.admin, id, {
      ...opts,
      mailer,
      summitRecipients: ["summit-team@it.example"],
    });

    expect(await db.project.findUnique({ where: { id } })).toBeNull();
    expect(
      await db.meetingRequest.count({
        where: { id: { in: [open.id, declined.id] } },
      }),
    ).toBe(0);
    // The held slot is free again.
    const slot = await db.slot.findFirstOrThrow({
      where: { startsAt: T1, room: { name: ROOM1 } },
    });
    expect(slot).toMatchObject({
      status: SlotStatus.OPEN,
      meetingRequestId: null,
    });
    // Only the open request was cancelled and told: investor, country, Summit mailbox.
    const to = mailer.sent.map((m) => m.to);
    expect(to).toContainEqual(["ivy.deleted@it.example"]);
    expect(to).toContainEqual(["summit-team@it.example"]);
    expect(to.flat()).not.toContain("bo.declined@it.example");
    expect(mailer.sent).toHaveLength(3);
    expect(
      await db.auditEvent.count({
        where: { action: REQUEST_AUDIT.CANCEL, entityId: open.id },
      }),
    ).toBe(1);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: WORKSPACE_AUDIT.PROJECT_DELETE, entityId: id },
    });
    expect(audit.metadata).toMatchObject({
      meetingRequestsDeleted: 2,
      openRequestsCancelled: 1,
      onBehalf: true,
    });
  });
});

describe("removing accounts", () => {
  it("erases and disables an investor, cancels their open requests and frees the email", async () => {
    const id = await projectWithTeaser("IT remove target project", true);
    const request = await createMeetingRequest(
      v.investor,
      id,
      requestInput(T1, "Ivy Removed"),
      requestOpts(),
    );
    const before = await db.user.findUniqueOrThrow({
      where: { id: ids.investor },
    });
    await db.session.create({
      data: {
        userId: ids.investor,
        token: `it-remove-${ids.investor}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const mailer = new MemoryMailer();
    await removeUser(v.admin, ids.investor, {
      mailer,
      summitRecipients: ["summit-team@it.example"],
    });

    const after = await db.user.findUniqueOrThrow({
      where: { id: ids.investor },
    });
    expect(after).toMatchObject({
      name: "Removed user",
      email: removedEmail(ids.investor),
      status: UserStatus.DEACTIVATED,
      organisation: null,
      jobTitle: null,
    });
    expect(after.removedAt).toBeInstanceOf(Date);
    expect(await db.session.count({ where: { userId: ids.investor } })).toBe(0);
    expect(await db.account.count({ where: { userId: ids.investor } })).toBe(0);
    expect(await viewerFor(ids.investor)).toBeNull();
    // The open request is cancelled and its slot freed; the removed person is not emailed.
    expect(
      (await db.meetingRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe(MeetingRequestStatus.CANCELLED);
    expect(
      await db.slot.count({ where: { meetingRequestId: request.id } }),
    ).toBe(0);
    expect(mailer.sent.map((m) => m.to).flat()).not.toContain(
      "ivy.removed@it.example",
    );
    expect(mailer.sent.map((m) => m.to)).toContainEqual([
      "summit-team@it.example",
    ]);
    // Gone from the admin list, audited, and the real address is free for a new account.
    expect((await listAccounts(v.admin)).map((a) => a.id)).not.toContain(
      ids.investor,
    );
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "user.remove", entityId: ids.investor },
    });
    expect(audit.actorId).toBe(ids.admin);
    expect(JSON.stringify(audit.metadata)).not.toContain(before.email);
    const again = await createUser({ email: before.email });
    expect(again.email).toBe(before.email);
    await db.user.delete({ where: { id: again.id } });
    // Removing twice is refused.
    expect(await refusal(removeUser(v.admin, ids.investor))).toBe("not_found");
    await deleteProject(v.admin, id, opts);
  });

  it("removes a country user's access to their country", async () => {
    await removeUser(v.admin, ids.memberA);
    expect(
      await db.countryMembership.count({ where: { userId: ids.memberA } }),
    ).toBe(0);
    expect(await viewerFor(ids.memberA)).toBeNull();
  });

  it("refuses self-removal, Summit admins removing platform admins, and every non-admin", async () => {
    expect(await refusal(removeUser(v.admin, ids.admin))).toBe("forbidden");
    expect(await refusal(removeUser(v.admin, ids.platform))).toBe("forbidden");
    for (const key of ["focalA", "focalB", "coordA", "investor2"] as const) {
      expect(await refusal(removeUser(v[key], ids.investor2)), key).toBe(
        "forbidden",
      );
    }
    const still = await db.user.findUniqueOrThrow({
      where: { id: ids.investor2 },
    });
    expect(still.removedAt).toBeNull();
    expect(still.status).toBe(UserStatus.ACTIVE);
    // A platform admin may remove a Summit admin.
    const other = await createUser({
      email: uniqueEmail("summit"),
      role: UserRole.SUMMIT_ADMIN,
    });
    await removeUser(v.platform, other.id);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: other.id } })).removedAt,
    ).toBeInstanceOf(Date);
  });
});
