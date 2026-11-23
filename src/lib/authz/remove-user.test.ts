// @vitest-environment node
// 23 Nov: who may remove an account (erase and disable). Same reach as switching an account off: admins only,
// never their own account, Summit admins not for platform admins, and never twice.

import { describe, expect, it } from "vitest";
import { MembershipRole, UserRole } from "@/generated/prisma/enums";
import { canRemoveUser } from "./admin";
import type { Viewer } from "./viewer";

function viewer(id: string, role: UserRole, countries: string[] = []): Viewer {
  return {
    id,
    role,
    memberships: countries.map((countryId) => ({
      countryId,
      role: MembershipRole.FOCAL_POINT,
    })),
  };
}

const platform = viewer("pa", UserRole.PLATFORM_ADMIN);
const summit = viewer("sa", UserRole.SUMMIT_ADMIN);
const focal = viewer("fa", UserRole.COUNTRY, ["a"]);
const coordinator = viewer("ca", UserRole.WBG_COORDINATOR, ["a"]);
const investor = viewer("i", UserRole.INVESTOR);

const target = (id: string, role: UserRole, removedAt: Date | null = null) => ({
  id,
  role,
  removedAt,
});

describe("canRemoveUser", () => {
  it("lets admins remove other accounts within their reach", () => {
    for (const role of [
      UserRole.INVESTOR,
      UserRole.COUNTRY,
      UserRole.WBG_COORDINATOR,
      UserRole.SUMMIT_ADMIN,
    ]) {
      expect(canRemoveUser(platform, target("x", role)), role).toBe(true);
    }
    expect(canRemoveUser(summit, target("x", UserRole.INVESTOR))).toBe(true);
    expect(canRemoveUser(summit, target("x", UserRole.COUNTRY))).toBe(true);
  });

  it("never lets a Summit admin remove a platform admin, nor anyone remove themselves", () => {
    expect(canRemoveUser(summit, target("x", UserRole.PLATFORM_ADMIN))).toBe(
      false,
    );
    expect(canRemoveUser(platform, target("pa", UserRole.PLATFORM_ADMIN))).toBe(
      false,
    );
    expect(canRemoveUser(summit, target("sa", UserRole.SUMMIT_ADMIN))).toBe(
      false,
    );
  });

  it("refuses country users, coordinators, investors and nobody", () => {
    for (const v of [focal, coordinator, investor, null]) {
      expect(canRemoveUser(v, target("x", UserRole.INVESTOR))).toBe(false);
      expect(canRemoveUser(v, target("x", UserRole.COUNTRY))).toBe(false);
    }
  });

  it("refuses an account that is already removed", () => {
    expect(
      canRemoveUser(platform, target("x", UserRole.INVESTOR, new Date())),
    ).toBe(false);
  });
});
