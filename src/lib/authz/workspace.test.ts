import { describe, expect, it } from "vitest";
import {
  MembershipRole,
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

// Who has a country workspace and what they may do there (M3, PLAN v0.3: countries read, admins act).
// Pure matrix; the database side is in tests/integration/workspace.test.ts.

const viewer = (
  role: UserRole,
  memberships: Viewer["memberships"] = [],
): Viewer => ({ id: `v-${role}`, role, memberships });

const admin = viewer(UserRole.SUMMIT_ADMIN);
const platform = viewer(UserRole.PLATFORM_ADMIN);
const focalA = viewer(UserRole.COUNTRY, [
  { countryId: "A", role: MembershipRole.FOCAL_POINT },
]);
const memberA = viewer(UserRole.COUNTRY, [
  { countryId: "A", role: MembershipRole.MEMBER },
]);
const coordinatorA = viewer(UserRole.WBG_COORDINATOR, [
  { countryId: "A", role: MembershipRole.MEMBER },
]);
const investor = viewer(UserRole.INVESTOR);
const countryWithoutMembership = viewer(UserRole.COUNTRY);

const project = (countryId: string, status: ProjectStatus) => ({
  countryId,
  status,
});

const NONE = {
  edit: false,
  uploadTeaser: false,
  publish: false,
  withdraw: false,
  delete: false,
  onBehalf: false,
};

describe("workspace access", () => {
  it("is for admins and country users only", () => {
    expect(canUseWorkspace(admin)).toBe(true);
    expect(canUseWorkspace(platform)).toBe(true);
    expect(canUseWorkspace(focalA)).toBe(true);
    expect(canUseWorkspace(memberA)).toBe(true);
    expect(canUseWorkspace(coordinatorA)).toBe(false);
    expect(canUseWorkspace(investor)).toBe(false);
    expect(canUseWorkspace(countryWithoutMembership)).toBe(false);
    expect(canUseWorkspace(null)).toBe(false);
  });

  it("lists only the viewer's own countries' projects", () => {
    expect(workspaceProjectWhere(admin)).toEqual({});
    expect(workspaceProjectWhere(focalA)).toEqual({
      countryId: { in: ["A"] },
    });
    expect(workspaceProjectWhere(coordinatorA)).toEqual({ id: { in: [] } });
    expect(workspaceProjectWhere(investor)).toEqual({ id: { in: [] } });
    expect(workspaceProjectWhere(null)).toEqual({ id: { in: [] } });
  });

  it("names active countries only: all for admins, own for country users", () => {
    expect(workspaceCountryWhere(admin)).toEqual({ status: "ACTIVE" });
    expect(workspaceCountryWhere(memberA)).toEqual({
      id: { in: ["A"] },
      status: "ACTIVE",
    });
    expect(workspaceCountryWhere(investor)).toEqual({ id: { in: [] } });
  });
});

describe("workspace permissions", () => {
  it("country users only read their projects; the uploader edits and deletes it while unpublished (23 Nov)", () => {
    for (const v of [focalA, memberA]) {
      for (const status of Object.values(ProjectStatus)) {
        expect(workspacePermissions(v, project("A", status))).toEqual(NONE);
        const unpublished = status !== ProjectStatus.PUBLISHED;
        expect(workspacePermissions(v, project("A", status), true)).toEqual({
          ...NONE,
          edit: unpublished,
          delete: unpublished,
        });
      }
    }
  });

  it("admins edit, upload and publish on behalf of the country", () => {
    expect(
      workspacePermissions(admin, project("B", ProjectStatus.WITHDRAWN)),
    ).toEqual({
      edit: true,
      uploadTeaser: true,
      publish: true,
      withdraw: false,
      delete: true,
      onBehalf: true,
    });
    expect(
      workspacePermissions(platform, project("A", ProjectStatus.PUBLISHED)),
    ).toMatchObject({ publish: false, withdraw: true, delete: true });
  });

  it("gives no rights to anyone else", () => {
    for (const v of [focalA, memberA, coordinatorA, investor, null]) {
      expect(
        workspacePermissions(v, project("B", ProjectStatus.DRAFT)),
      ).toEqual(NONE);
    }
  });
});
