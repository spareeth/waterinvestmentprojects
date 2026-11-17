import { describe, expect, it } from "vitest";
import { UserStatus } from "@/generated/prisma/enums";
import {
  accountStage,
  type GateUser,
  sessionProblem,
  STAGE_PATH,
} from "./account-gate";

const ready: GateUser = {
  status: UserStatus.ACTIVE,
  mfaEnabled: true,
  termsAcceptedAt: new Date("2026-11-10T09:00:00Z"),
};
const strict = { skipSecondStep: false };
const limits = { idleMinutes: 120, maxHours: 12 };
const signedInAt = new Date("2026-11-17T08:00:00Z");

function at(minutesAfterSignIn: number): Date {
  return new Date(signedInAt.getTime() + minutesAfterSignIn * 60_000);
}

describe("accountStage", () => {
  it("lets an approved, enrolled user who accepted the terms in", () => {
    expect(accountStage(ready, strict)).toBe("active");
  });

  it("shows a pending account nothing but the pending screen", () => {
    const pending = { ...ready, status: UserStatus.PENDING_APPROVAL };
    expect(accountStage(pending, strict)).toBe("pending");
    // Even with enrolment and terms done, and with the demo switch on.
    expect(accountStage(pending, { skipSecondStep: true })).toBe("pending");
  });

  it("never treats a deactivated account as active", () => {
    const gone = { ...ready, status: UserStatus.DEACTIVATED };
    expect(accountStage(gone, strict)).not.toBe("active");
  });

  it("requires two-step enrolment before the terms and the portal", () => {
    const notEnrolled = { ...ready, mfaEnabled: false, termsAcceptedAt: null };
    expect(accountStage(notEnrolled, strict)).toBe("enrol-2fa");
    expect(accountStage({ ...ready, mfaEnabled: false }, strict)).toBe(
      "enrol-2fa",
    );
  });

  it("makes enrolment optional only when the demo switch is on", () => {
    const notEnrolled = { ...ready, mfaEnabled: false };
    expect(accountStage(notEnrolled, { skipSecondStep: true })).toBe("active");
  });

  it("requires the terms before first use", () => {
    expect(accountStage({ ...ready, termsAcceptedAt: null }, strict)).toBe(
      "terms",
    );
  });

  it("maps every stage to a page", () => {
    expect(STAGE_PATH).toEqual({
      pending: "/pending",
      "enrol-2fa": "/two-factor/setup",
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
