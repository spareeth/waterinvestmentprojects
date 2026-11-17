import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationState,
} from "./invitation-token";

const now = new Date("2026-11-17T10:00:00Z");
const later = new Date("2026-11-24T10:00:00Z");

describe("invitation tokens", () => {
  it("are long, random and URL-safe", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are stored as a SHA-256 hash", () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(hashInvitationToken(token)).not.toContain(token);
  });
});

describe("invitationState", () => {
  it("is valid before expiry and unused", () => {
    expect(invitationState({ acceptedAt: null, expiresAt: later }, now)).toBe(
      "valid",
    );
  });

  it("is expired at or after the expiry time", () => {
    expect(invitationState({ acceptedAt: null, expiresAt: now }, now)).toBe(
      "expired",
    );
  });

  it("stays used once accepted, even after expiry", () => {
    expect(invitationState({ acceptedAt: now, expiresAt: later }, later)).toBe(
      "accepted",
    );
  });

  it("is not found when there is no invitation", () => {
    expect(invitationState(null, now)).toBe("not_found");
  });
});
