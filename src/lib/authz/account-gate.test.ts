import { describe, expect, it } from "vitest";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import {
  accountStage,
  type GateUser,
  needsInvestorAck,
  sessionProblem,
  STAGE_PATH,
} from "./account-gate";

const ACK = "investor-ack-test-v1";

const ready: GateUser = {
  role: UserRole.COUNTRY,
  status: UserStatus.ACTIVE,
  mfaEnabled: true,
  mustChangePassword: false,
  termsAcceptedAt: new Date("2026-11-10T09:00:00Z"),
  investorAckTextVersion: null,
};
const investor: GateUser = {
  ...ready,
  role: UserRole.INVESTOR,
  termsAcceptedAt: null,
  investorAckTextVersion: ACK,
};
/** PLAN 0a.3: email and password only (the default). */
const passwordOnly = { secondStep: "none", investorAckVersion: ACK } as const;
/** The dormant authenticator-app mode. */
const totp = { secondStep: "totp", investorAckVersion: ACK } as const;
const limits = { idleMinutes: 120, maxHours: 12 };
const signedInAt = new Date("2026-11-17T08:00:00Z");

function at(minutesAfterSignIn: number): Date {
  return new Date(signedInAt.getTime() + minutesAfterSignIn * 60_000);
}

describe("accountStage", () => {
  it("lets an approved user who accepted the terms in", () => {
    expect(accountStage(ready, passwordOnly)).toBe("active");
    expect(accountStage(ready, totp)).toBe("active");
  });

  it("shows a pending account nothing but the pending screen", () => {
    const pending = { ...ready, status: UserStatus.PENDING_APPROVAL };
    expect(accountStage(pending, passwordOnly)).toBe("pending");
    expect(accountStage(pending, totp)).toBe("pending");
    expect(
      accountStage({ ...pending, mustChangePassword: true }, passwordOnly),
    ).toBe("pending");
  });

  it("never treats a deactivated account as active", () => {
    const gone = { ...ready, status: UserStatus.DEACTIVATED };
    expect(accountStage(gone, passwordOnly)).not.toBe("active");
  });

  it("asks for no second step with email and password only (PLAN 0a.3)", () => {
    const notEnrolled = { ...ready, mfaEnabled: false };
    expect(accountStage(notEnrolled, passwordOnly)).toBe("active");
  });

  it("requires authenticator enrolment before the terms when the second step is totp", () => {
    const notEnrolled = { ...ready, mfaEnabled: false, termsAcceptedAt: null };
    expect(accountStage(notEnrolled, totp)).toBe("enrol-2fa");
    expect(accountStage({ ...investor, mfaEnabled: false }, totp)).toBe(
      "enrol-2fa",
    );
  });

  it("makes a temporary password the first thing to replace, for every role", () => {
    for (const role of Object.values(UserRole)) {
      const user = {
        ...ready,
        role,
        mfaEnabled: false,
        mustChangePassword: true,
        termsAcceptedAt: null,
        investorAckTextVersion: null,
      };
      expect(accountStage(user, passwordOnly), role).toBe("change-password");
      expect(accountStage(user, totp), role).toBe("change-password");
    }
  });

  it("requires the terms before first use, except for investors", () => {
    expect(
      accountStage({ ...ready, termsAcceptedAt: null }, passwordOnly),
    ).toBe("terms");
    for (const role of [
      UserRole.PLATFORM_ADMIN,
      UserRole.SUMMIT_ADMIN,
      UserRole.WBG_COORDINATOR,
    ]) {
      expect(
        accountStage({ ...ready, role, termsAcceptedAt: null }, passwordOnly),
        role,
      ).toBe("terms");
    }
    expect(accountStage(investor, passwordOnly)).toBe("active");
  });

  it("keeps investors out until they accept the current investor acknowledgement", () => {
    const notYet = { ...investor, investorAckTextVersion: null };
    expect(accountStage(notYet, passwordOnly)).toBe("investor-ack");
    // Accepting the terms is not enough.
    expect(
      accountStage({ ...notYet, termsAcceptedAt: new Date() }, passwordOnly),
    ).toBe("investor-ack");
    // A new wording version (e.g. WBG's final text replacing the placeholder) asks again.
    const old = { ...investor, investorAckTextVersion: "investor-ack-old" };
    expect(accountStage(old, passwordOnly)).toBe("investor-ack");
  });

  it("asks only investors for the investor acknowledgement", () => {
    for (const role of Object.values(UserRole)) {
      expect(
        needsInvestorAck(
          { role, investorAckTextVersion: null },
          { investorAckVersion: ACK },
        ),
        role,
      ).toBe(role === UserRole.INVESTOR);
    }
  });

  it("maps every stage to a page", () => {
    expect(STAGE_PATH).toEqual({
      pending: "/pending",
      "change-password": "/change-password",
      "enrol-2fa": "/two-factor/setup",
      "investor-ack": "/acknowledgement",
      terms: "/terms",
      active: "/home",
    });
  });
});

describe("sessionProblem", () => {
  const fresh = { createdAt: signedInAt, lastSeenAt: signedInAt };

  it("accepts a session in use", () => {
    expect(sessionProblem(ready, fresh, at(30), limits)).toBeNull();
  });

  it("ends a session after the idle timeout", () => {
    expect(sessionProblem(ready, fresh, at(121), limits)).toBe("idle");
  });

  it("ends an active session after the maximum age", () => {
    const busy = { createdAt: signedInAt, lastSeenAt: at(12 * 60) };
    expect(sessionProblem(ready, busy, at(12 * 60 + 1), limits)).toBe(
      "expired",
    );
  });

  it("ends every session of a deactivated account", () => {
    expect(
      sessionProblem({ status: UserStatus.DEACTIVATED }, fresh, at(1), limits),
    ).toBe("deactivated");
  });
});
