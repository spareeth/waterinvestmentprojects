import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MembershipRole, UserRole, UserStatus } from "@/generated/prisma/enums";
import {
  acceptInvitation,
  createInvitation,
  hashInvitationToken,
  InvitationError,
} from "@/lib/auth/invitations";
import type { Actor } from "@/lib/authz/account-policies";
import { db } from "@/lib/db";
import {
  actorFor,
  cleanUp,
  COUNTRY_ID,
  createUser,
  ensureCountry,
  PASSWORD,
  requestHeaders,
  testAuth,
  uniqueEmail,
} from "./helpers";

const auth = testAuth();
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };
let admin: Actor;
let focalPoint: Actor;

beforeAll(async () => {
  await cleanUp();
  await ensureCountry();
  admin = await actorFor(
    (await createUser({ role: UserRole.SUMMIT_ADMIN, mfaEnabled: true })).id,
  );
  focalPoint = await actorFor(
    (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.FOCAL_POINT,
        mfaEnabled: true,
      })
    ).id,
  );
});

afterAll(cleanUp);

function accept(token: string, now?: Date) {
  return acceptInvitation(
    token,
    { name: "Invited Person", password: PASSWORD, organisation: "Test Org" },
    meta,
    { auth, now },
  );
}

describe("invitations", () => {
  it("stores only the hash of the token", async () => {
    const { invitation, token, url } = await createInvitation(admin, {
      email: uniqueEmail("hash"),
      role: UserRole.INVESTOR,
    });
    expect(invitation.tokenHash).toBe(hashInvitationToken(token));
    expect(invitation.tokenHash).not.toContain(token);
    expect(url).toContain(`/invitation/${token}`);
    const audit = await db.auditEvent.findFirst({
      where: { action: "invitation.create", entityId: invitation.id },
    });
    expect(audit?.actorId).toBe(admin.id);
  });

  it("creates an active investor with a password and records the acceptance", async () => {
    const email = uniqueEmail("investor");
    const { invitation, token } = await createInvitation(admin, {
      email,
      role: UserRole.INVESTOR,
    });
    const { userId } = await accept(token);

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { accounts: true, memberships: true },
    });
    expect(user).toMatchObject({
      email,
      role: UserRole.INVESTOR,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      mfaEnabled: false,
      termsAcceptedAt: null,
    });
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0].providerId).toBe("credential");
    expect(user.accounts[0].password).not.toContain(PASSWORD);
    expect(user.memberships).toHaveLength(0);

    const stored = await db.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(stored.acceptedAt).not.toBeNull();
    const audit = await db.auditEvent.findFirst({
      where: { action: "invitation.accept", entityId: invitation.id },
    });
    expect(audit?.actorId).toBe(userId);
  });

  it("creates the country membership chosen on the invitation", async () => {
    const { token } = await createInvitation(focalPoint, {
      email: uniqueEmail("member"),
      role: UserRole.COUNTRY,
      countryId: COUNTRY_ID,
      membershipRole: MembershipRole.MEMBER,
    });
    const { userId } = await accept(token);
    const memberships = await db.countryMembership.findMany({
      where: { userId },
    });
    expect(memberships).toEqual([
      expect.objectContaining({
        countryId: COUNTRY_ID,
        role: MembershipRole.MEMBER,
      }),
    ]);
  });

  it("does not let a focal point invite another focal point", async () => {
    await expect(
      createInvitation(focalPoint, {
        email: uniqueEmail("focal"),
        role: UserRole.COUNTRY,
        countryId: COUNTRY_ID,
        membershipRole: MembershipRole.FOCAL_POINT,
      }),
    ).rejects.toThrow(/Not allowed/);
  });

  it("can be used only once", async () => {
    const email = uniqueEmail("reuse");
    const { token } = await createInvitation(admin, {
      email,
      role: UserRole.INVESTOR,
    });
    await accept(token);
    await expect(accept(token)).rejects.toMatchObject({ state: "accepted" });
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it("can be used only once even when two requests arrive together", async () => {
    const email = uniqueEmail("race");
    const { token } = await createInvitation(admin, {
      email,
      role: UserRole.INVESTOR,
    });
    const results = await Promise.allSettled([accept(token), accept(token)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(
      rejected?.status === "rejected" &&
        rejected.reason instanceof InvitationError,
    ).toBe(true);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it("cannot be used after it expires", async () => {
    const email = uniqueEmail("expired");
    const now = new Date();
    const { invitation, token } = await createInvitation(
      admin,
      { email, role: UserRole.INVESTOR, expiresInDays: 1 },
      undefined,
      now,
    );
    const later = new Date(now.getTime() + 25 * 60 * 60_000);
    await expect(accept(token, later)).rejects.toMatchObject({
      state: "expired",
    });
    const stored = await db.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(stored.acceptedAt).toBeNull();
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("rejects an unknown token", async () => {
    await expect(accept("not-a-real-token")).rejects.toMatchObject({
      state: "not_found",
    });
  });

  it("signs the new user in with the chosen password", async () => {
    const email = uniqueEmail("signin");
    const { token } = await createInvitation(admin, {
      email,
      role: UserRole.INVESTOR,
    });
    await accept(token);
    const { signInWithPassword } = await import("@/lib/auth/service");
    const result = await signInWithPassword(
      { email, password: PASSWORD },
      requestHeaders(),
      auth,
    );
    expect(result.status).toBe("signed-in");
  });
});
