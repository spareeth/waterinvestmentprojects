import { describe, expect, it } from "vitest";
import {
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import type { Viewer } from "./viewer";
import {
  canUseWorkspace,
  workspaceCountryWhere,
  workspacePermissions,
  workspaceProjectWhere,
} from "./workspace";

// M5: who has a country workspace and what they may do there. Pure matrix; the database side is in
// tests/integration/workspace.test.ts.

const viewer = (
  role: UserRole,
  memberships: Viewer["memberships"] = [],
  pipelineScope: PipelineScope = PipelineScope.NONE,
): Viewer => ({
  id: `v-${role}`,
  role,
  memberships,
  pipelineScope,
  pipelineCountryIds: [],
});

const admin = viewer(UserRole.SUMMIT_ADMIN);
const platform = viewer(UserRole.PLATFORM_ADMIN);
const focalA = viewer(UserRole.COUNTRY, [
  { countryId: "A", role: MembershipRole.FOCAL_POINT },
]);
const memberA = viewer(UserRole.COUNTRY, [
  { countryId: "A", role: MembershipRole.MEMBER },
]);
// A country user who also sees the whole pipeline: still only manages country A.
const focalAWide = viewer(
  UserRole.COUNTRY,
  [{ countryId: "A", role: MembershipRole.FOCAL_POINT }],
  PipelineScope.ALL,
);
const investor = viewer(UserRole.INVESTOR, [], PipelineScope.ALL);
const countryWithoutMembership = viewer(UserRole.COUNTRY);

const project = (countryId: string, status: ProjectStatus) => ({
  countryId,
  status,
});

describe("workspace access", () => {
  it("is for admins and country members only", () => {
    expect(canUseWorkspace(admin)).toBe(true);
    expect(canUseWorkspace(platform)).toBe(true);
    expect(canUseWorkspace(focalA)).toBe(true);
    expect(canUseWorkspace(memberA)).toBe(true);
    expect(canUseWorkspace(investor)).toBe(false);
    expect(canUseWorkspace(countryWithoutMembership)).toBe(false);
    expect(canUseWorkspace(null)).toBe(false);
  });

  it("lists only the viewer's own countries' projects, whatever the pipeline scope", () => {
    expect(workspaceProjectWhere(admin)).toEqual({});
    expect(workspaceProjectWhere(focalA)).toEqual({
      countryId: { in: ["A"] },
    });
    expect(workspaceProjectWhere(focalAWide)).toEqual({
      countryId: { in: ["A"] },
    });
    expect(workspaceProjectWhere(investor)).toEqual({ id: { in: [] } });
    expect(workspaceProjectWhere(null)).toEqual({ id: { in: [] } });
  });

  it("offers active countries only: all for admins, own for country users", () => {
    expect(workspaceCountryWhere(admin)).toEqual({ status: "ACTIVE" });
    expect(workspaceCountryWhere(memberA)).toEqual({
      id: { in: ["A"] },
      status: "ACTIVE",
    });
    expect(workspaceCountryWhere(investor)).toEqual({ id: { in: [] } });
  });
});

describe("workspace permissions", () => {
  it("focal point: edit, upload and publish a draft; no on-behalf", () => {
    expect(
      workspacePermissions(focalA, project("A", ProjectStatus.DRAFT)),
    ).toEqual({
      edit: true,
      uploadTeaser: true,
      publish: true,
      withdraw: false,
      onBehalf: false,
    });
    expect(
      workspacePermissions(focalA, project("A", ProjectStatus.PUBLISHED)),
    ).toMatchObject({ edit: true, publish: false, withdraw: true });
  });

  it("member: drafts only, never publishes", () => {
    expect(
      workspacePermissions(memberA, project("A", ProjectStatus.DRAFT)),
    ).toEqual({
      edit: true,
      uploadTeaser: true,
      publish: false,
      withdraw: false,
      onBehalf: false,
    });
    for (const status of [ProjectStatus.PUBLISHED, ProjectStatus.WITHDRAWN]) {
      expect(workspacePermissions(memberA, project("A", status))).toMatchObject(
        { edit: false, uploadTeaser: false, publish: false, withdraw: false },
      );
    }
  });

  it("admin acts on behalf of the country", () => {
    expect(
      workspacePermissions(admin, project("B", ProjectStatus.WITHDRAWN)),
    ).toMatchObject({ edit: true, publish: true, onBehalf: true });
  });

  it("no rights in another country's project, even with a wide pipeline", () => {
    for (const v of [focalA, memberA, focalAWide, investor]) {
      expect(
        workspacePermissions(v, project("B", ProjectStatus.DRAFT)),
      ).toEqual({
        edit: false,
        uploadTeaser: false,
        publish: false,
        withdraw: false,
        onBehalf: false,
      });
    }
  });
});
