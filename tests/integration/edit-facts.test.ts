// 23 Nov (Sajid): the person who uploaded a project may edit its key facts while it is not published; admins
// always. Against real PostgreSQL: the uploader from My projects and the uploader through the upload link (matched
// by their account email) may edit; another user of the same country, other countries, coordinators and investors
// may not, and nothing changes for them; once published, only admins.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MembershipRole,
  ProjectStatus,
  ProjectType,
  UserRole,
} from "@/generated/prisma/enums";
import { isProjectUploader, type Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { MemoryMailer } from "@/lib/mail";
import { LocalBlobStore } from "@/lib/storage";
import {
  type SubmissionOptions,
  submitWorkspaceTeasers,
} from "@/lib/submission/service";
import type { ProjectInput } from "@/lib/workspace/project-input";
import {
  getWorkspaceProject,
  readProjectTeaserFacts,
  updateProject,
  WORKSPACE_AUDIT,
  WorkspaceError,
} from "@/lib/workspace/service";
import { cleanUp, createUser, uniqueEmail, viewerFor } from "./helpers";

const C = { a: "it-ef-a", b: "it-ef-b" } as const;

type Key =
  | "admin"
  | "uploader"
  | "linkUploader"
  | "memberA"
  | "focalB"
  | "coordA"
  | "investor";
const v = {} as Record<Key, Viewer>;
let blobDir: string;
let opts: SubmissionOptions;
let linkEmail: string;
const P: Record<"workspace" | "link", string> = { workspace: "", link: "" };

const pdf = (label: string) => ({
  name: `${label}.pdf`,
  bytes: new TextEncoder().encode(`%PDF-1.7\n% ${label}\n%%EOF\n`),
});

const facts = (title: string): ProjectInput => ({
  title,
  sector: "Desalination",
  region: "Northern coast",
  projectType: ProjectType.SUMMIT_PIPELINE,
  pppModel: "Concession",
  sizeMinUsd: "50000000",
  sizeMaxUsd: "80000000",
  developmentStage: "Feasibility in progress",
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WorkspaceError) return error.code;
    throw error;
  }
  return "allowed";
}

const titleOf = async (id: string) =>
  (await db.project.findUniqueOrThrow({ where: { id } })).title;

beforeAll(async () => {
  await cleanUp();
  blobDir = await mkdtemp(path.join(tmpdir(), "it-ef-blobs-"));
  opts = {
    store: new LocalBlobStore(blobDir),
    scanMode: "assume-clean",
    mailer: new MemoryMailer(),
  };
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Edit A", iso3: "XEA" },
      { id: C.b, name: "IT Edit B", iso3: "XEB" },
    ],
  });
  const make = async (
    key: Key,
    role: UserRole,
    membershipRole?: MembershipRole,
    countryId?: string,
    email?: string,
  ) => {
    const u = await createUser({
      email,
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
  await make("uploader", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  linkEmail = uniqueEmail("link.uploader");
  await make(
    "linkUploader",
    UserRole.COUNTRY,
    MembershipRole.MEMBER,
    C.a,
    linkEmail,
  );
  await make("memberA", UserRole.COUNTRY, MembershipRole.MEMBER, C.a);
  await make("focalB", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  await make("coordA", UserRole.WBG_COORDINATOR, MembershipRole.MEMBER, C.a);
  await make("investor", UserRole.INVESTOR);

  // From My projects: the teaser document records the uploader's account.
  const receipt = await submitWorkspaceTeasers(
    v.uploader,
    {
      uploaderName: "Uma Uploader",
      uploaderEmail: "typed.differently@it.example",
      uploaderJobTitle: "Project lead",
      governmentOrganisation: "Ministry of Fictional Water",
      acknowledged: true,
      teasers: [{ sector: "Desalination", file: pdf("Edit workspace") }],
    },
    opts,
  );
  P.workspace = receipt.projectIds[0];

  // Through the upload link: no account, only the email the uploader typed (here in other letter case).
  const submission = await db.submission.create({
    data: {
      countryId: C.a,
      uploaderName: "Lin Link",
      uploaderEmail: linkEmail.toUpperCase(),
      ackTextVersion: "country-upload-ack-v2",
      ackAcceptedAt: new Date(),
    },
  });
  P.link = (
    await db.project.create({
      data: {
        countryId: C.a,
        submissionId: submission.id,
        title: "IT link project",
        sector: "Water supply",
        status: ProjectStatus.DRAFT,
      },
    })
  ).id;
});

afterAll(async () => {
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("editing key facts", () => {
  it("recognises the uploader from My projects and from the upload link, and nobody else", async () => {
    expect(await isProjectUploader(v.uploader, P.workspace)).toBe(true);
    expect(await isProjectUploader(v.linkUploader, P.link)).toBe(true);
    expect(await isProjectUploader(v.uploader, P.link)).toBe(false);
    expect(await isProjectUploader(v.linkUploader, P.workspace)).toBe(false);
    for (const key of ["memberA", "focalB", "coordA", "investor"] as const) {
      expect(await isProjectUploader(v[key], P.workspace), key).toBe(false);
    }
  });

  it("lets each uploader edit their own draft, audited, and shows them an editable form", async () => {
    expect(
      (await getWorkspaceProject(v.uploader, P.workspace))?.permissions.edit,
    ).toBe(true);
    const changed = await updateProject(
      v.uploader,
      P.workspace,
      facts("IT workspace edited"),
    );
    expect(changed).toContain("title");
    expect(await titleOf(P.workspace)).toBe("IT workspace edited");
    await updateProject(v.linkUploader, P.link, facts("IT link edited"));
    expect(await titleOf(P.link)).toBe("IT link edited");
    expect(
      await db.auditEvent.count({
        where: {
          action: WORKSPACE_AUDIT.PROJECT_UPDATE,
          entityId: { in: [P.workspace, P.link] },
        },
      }),
    ).toBe(2);
    // Fill from teaser is open to the uploader too (nothing readable in this tiny PDF: null, not refused).
    expect(
      await readProjectTeaserFacts(v.uploader, P.workspace, {
        store: opts.store,
      }),
    ).toBeNull();
  });

  it("refuses another user of the same country, other countries, coordinators and investors", async () => {
    expect(
      (await getWorkspaceProject(v.memberA, P.workspace))?.permissions.edit,
    ).toBe(false);
    expect(
      await refusal(updateProject(v.memberA, P.workspace, facts("x"))),
    ).toBe("forbidden");
    expect(
      await refusal(
        readProjectTeaserFacts(v.memberA, P.workspace, { store: opts.store }),
      ),
    ).toBe("forbidden");
    for (const key of ["focalB", "coordA", "investor"] as const) {
      expect(
        await refusal(updateProject(v[key], P.workspace, facts("x"))),
        key,
      ).toBe("not_found");
    }
    expect(await titleOf(P.workspace)).toBe("IT workspace edited");
  });

  it("leaves a published project to the Summit team", async () => {
    await db.project.update({
      where: { id: P.workspace },
      data: { status: ProjectStatus.PUBLISHED, publishedAt: new Date() },
    });
    expect(
      (await getWorkspaceProject(v.uploader, P.workspace))?.permissions.edit,
    ).toBe(false);
    expect(
      await refusal(updateProject(v.uploader, P.workspace, facts("late"))),
    ).toBe("forbidden");
    await updateProject(v.admin, P.workspace, facts("IT admin edited"));
    expect(await titleOf(P.workspace)).toBe("IT admin edited");
  });
});
