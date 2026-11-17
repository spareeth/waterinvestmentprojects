import { describe, expect, it } from "vitest";
import {
  MembershipRole,
  PipelineScope,
  UserRole,
} from "@/generated/prisma/enums";
import {
  type Actor,
  canApproveUsers,
  canInvite,
  canSetPipelineScope,
  defaultPipelineScope,
  invitationShapeError,
} from "./account-policies";

const platformAdmin: Actor = {
  id: "p",
  role: UserRole.PLATFORM_ADMIN,
  memberships: [],
};
const summitAdmin: Actor = {
  id: "s",
  role: UserRole.SUMMIT_ADMIN,
  memberships: [],
};
const focalA: Actor = {
  id: "fa",
  role: UserRole.COUNTRY,
  memberships: [{ countryId: "a", role: MembershipRole.FOCAL_POINT }],
};
const memberA: Actor = {
  id: "ma",
  role: UserRole.COUNTRY,
  memberships: [{ countryId: "a", role: MembershipRole.MEMBER }],
};
const investor: Actor = { id: "i", role: UserRole.INVESTOR, memberships: [] };

const investorInvite = {
  role: UserRole.INVESTOR,
  countryId: null,
  membershipRole: null,
};
const memberOf = (countryId: string) => ({
  role: UserRole.COUNTRY,
  countryId,
  membershipRole: MembershipRole.MEMBER,
});
const focalOf = (countryId: string) => ({
  role: UserRole.COUNTRY,
  countryId,
  membershipRole: MembershipRole.FOCAL_POINT,
});

describe("invitation shape", () => {
  it("needs a country and membership role for country invitations", () => {
    expect(
      invitationShapeError({
        role: UserRole.COUNTRY,
        countryId: "a",
        membershipRole: null,
      }),
    ).toMatch(/membership role/);
    expect(invitationShapeError(memberOf("a"))).toBeNull();
  });

  it("refuses a country on other invitations", () => {
    expect(
      invitationShapeError({ ...investorInvite, countryId: "a" }),
    ).not.toBeNull();
  });
});

describe("canInvite", () => {
  it("lets admins invite investors and country focal points", () => {
    for (const admin of [platformAdmin, summitAdmin]) {
      expect(canInvite(admin, investorInvite)).toBe(true);
      expect(canInvite(admin, focalOf("a"))).toBe(true);
      expect(canInvite(admin, memberOf("b"))).toBe(true);
    }
  });

  it("keeps platform admin invitations to platform admins", () => {
    const invite = { ...investorInvite, role: UserRole.PLATFORM_ADMIN };
    expect(canInvite(platformAdmin, invite)).toBe(true);
    expect(canInvite(summitAdmin, invite)).toBe(false);
  });

  it("lets a focal point invite members to their own country only", () => {
    expect(canInvite(focalA, memberOf("a"))).toBe(true);
    expect(canInvite(focalA, memberOf("b"))).toBe(false);
    expect(canInvite(focalA, focalOf("a"))).toBe(false);
    expect(canInvite(focalA, investorInvite)).toBe(false);
  });

  it("does not let country members or investors invite anyone", () => {
    expect(canInvite(memberA, memberOf("a"))).toBe(false);
    expect(canInvite(investor, investorInvite)).toBe(false);
  });

  it("lets only admins widen a new user's pipeline", () => {
    const withAll = { ...memberOf("a"), pipelineScope: PipelineScope.ALL };
    expect(canInvite(summitAdmin, withAll)).toBe(true);
    expect(canInvite(focalA, withAll)).toBe(false);
    expect(
      canInvite(focalA, {
        ...memberOf("a"),
        pipelineScope: PipelineScope.NONE,
      }),
    ).toBe(true);
    expect(
      canInvite(summitAdmin, {
        ...investorInvite,
        pipelineScope: PipelineScope.SELECTED,
      }),
    ).toBe(true);
  });
});

describe("pipeline scope", () => {
  it("defaults to the whole pipeline for investors and none for everyone else", () => {
    expect(defaultPipelineScope(UserRole.INVESTOR)).toBe(PipelineScope.ALL);
    expect(defaultPipelineScope(UserRole.COUNTRY)).toBe(PipelineScope.NONE);
    expect(defaultPipelineScope(UserRole.SUMMIT_ADMIN)).toBe(
      PipelineScope.NONE,
    );
  });

  it("is changed by admins only", () => {
    expect(canSetPipelineScope(summitAdmin)).toBe(true);
    expect(canSetPipelineScope(platformAdmin)).toBe(true);
    expect(canSetPipelineScope(focalA)).toBe(false);
    expect(canSetPipelineScope(investor)).toBe(false);
  });
});

describe("canApproveUsers", () => {
  it("is limited to the Summit team and platform admins", () => {
    expect(canApproveUsers(summitAdmin)).toBe(true);
    expect(canApproveUsers(platformAdmin)).toBe(true);
    expect(canApproveUsers(focalA)).toBe(false);
    expect(canApproveUsers(investor)).toBe(false);
  });
});
