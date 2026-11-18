// M2 (PLAN 0a.3 and 0a.4): accounts handed out by admins with a temporary password, the first sign-in (new
// password, investor acknowledgement), new temporary passwords, and the cross-country isolation of the
// accounts created this way, against real PostgreSQL.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryContactRole,
  MembershipRole,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import {
  acceptInvestorAcknowledgement,
  AccountError,
  changeTemporaryPassword,
  createAccount,
  listAccounts,
  resetTemporaryPassword,
} from "@/lib/auth/accounts";
import { signInWithPassword } from "@/lib/auth/service";
import { getCurrentSession } from "@/lib/auth/session";
import { TEMPORARY_PASSWORD_PATTERN } from "@/lib/auth/temporary-password";
import {
  canCreateAccount,
  canManageAccounts,
} from "@/lib/authz/account-policies";
import { canUseWorkspace, projectWhere, userWhere } from "@/lib/authz";
import type { Viewer } from "@/lib/authz/viewer";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import {
  cleanUp,
  CookieJar,
  createUser,
  gatePasswordOnly,
  PASSWORD,
  requestHeaders,
  testAuth,
  uniqueEmail,
  viewerFor,
} from "./helpers";

const auth = testAuth();
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };
const C = { a: "it-acc-a", b: "it-acc-b" } as const;
const P = {
  aDraft: "it-acc-p-a-draft",
  aPub: "it-acc-p-a-pub",
  bDraft: "it-acc-p-b-draft",
  bPub: "it-acc-p-b-pub",
} as const;
const NEW_PASSWORD = "My-own-new-password-2026";

let summitAdmin: Viewer;
let platformAdmin: Viewer;
let platformAdminId: string;
let summitAdminId: string;

async function signIn(email: string, password: string) {
  const jar = new CookieJar();
  const result = await signInWithPassword(
    { email, password },
    requestHeaders(),
    auth,
  );
  if (result.status !== "failed") jar.store(result.headers);
  return { result, jar };
}

function current(jar: CookieJar) {
  return getCurrentSession(jar.headers(), { auth, config: gatePasswordOnly });
}

async function activeViewer(userId: string): Promise<Viewer> {
  const viewer = await viewerFor(userId, gatePasswordOnly);
  if (!viewer) throw new Error("expected an active viewer");
  return viewer;
}

async function visibleProjects(viewer: Viewer | null) {
  const rows = await db.project.findMany({
    where: { AND: [{ id: { in: Object.values(P) } }, projectWhere(viewer)] },
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
}

beforeAll(async () => {
  await cleanUp();
  for (const [key, id] of Object.entries(C)) {
    await db.country.create({
      data: {
        id,
        name: `Accounts Country ${key.toUpperCase()}`,
        iso3: `XM${key.toUpperCase()}`,
      },
    });
  }
  const project = (id: string, countryId: string, status: ProjectStatus) =>
    db.project.create({
      data: {
        id,
        countryId,
        title: id,
        sector: "Water supply",
        status,
        publishedAt: status === ProjectStatus.PUBLISHED ? new Date() : null,
      },
    });
  await project(P.aDraft, C.a, ProjectStatus.DRAFT);
  await project(P.aPub, C.a, ProjectStatus.PUBLISHED);
  await project(P.bDraft, C.b, ProjectStatus.DRAFT);
  await project(P.bPub, C.b, ProjectStatus.PUBLISHED);

  const summit = await createUser({
    role: UserRole.SUMMIT_ADMIN,
    mfaEnabled: true,
    termsAccepted: true,
  });
  const platform = await createUser({
    role: UserRole.PLATFORM_ADMIN,
    mfaEnabled: true,
    termsAccepted: true,
  });
  summitAdminId = summit.id;
  platformAdminId = platform.id;
  summitAdmin = await activeViewer(summit.id);
  platformAdmin = await activeViewer(platform.id);
});

afterAll(cleanUp);

describe("creating an account (admin hand-out)", () => {
  it("creates an active country focal point with a temporary password, and links only the matching contact", async () => {
    const email = uniqueEmail("focal");
    // Same address as contact for both countries, and as a WBG coordinator contact of A: only A's focal point
    // contact belongs to the new account.
    await db.countryContact.createMany({
      data: [
        {
          countryId: C.a,
          name: "Focal",
          email,
          role: CountryContactRole.FOCAL_POINT,
        },
        {
          countryId: C.b,
          name: "Focal",
          email,
          role: CountryContactRole.FOCAL_POINT,
        },
        {
          countryId: C.a,
          name: "Focal",
          email,
          role: CountryContactRole.WBG_COORDINATOR,
        },
      ],
    });

    const created = await createAccount(
      summitAdmin,
      {
        email: email.toUpperCase(),
        name: "  New Focal  ",
        organisation: "Ministry",
        role: UserRole.COUNTRY,
        countryIds: [C.a],
      },
      meta,
      { auth },
    );
    expect(created.email).toBe(email);
    expect(created.temporaryPassword).toMatch(TEMPORARY_PASSWORD_PATTERN);

    const user = await db.user.findUniqueOrThrow({
      where: { id: created.userId },
      include: { memberships: true, countryContacts: true },
    });
    expect(user).toMatchObject({
      name: "New Focal",
      status: "ACTIVE",
      mustChangePassword: true,
      investorAckTextVersion: null,
    });
    expect(user.memberships).toEqual([
      expect.objectContaining({
        countryId: C.a,
        role: MembershipRole.FOCAL_POINT,
      }),
    ]);
    expect(user.countryContacts).toEqual([
      expect.objectContaining({
        countryId: C.a,
        role: CountryContactRole.FOCAL_POINT,
      }),
    ]);

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "user.create", entityId: created.userId },
    });
    expect(audit).toMatchObject({ actorId: summitAdminId, ip: meta.ip });
    expect(JSON.stringify(audit.metadata)).not.toContain(
      created.temporaryPassword,
    );
    // The temporary password is never stored in clear anywhere.
    const account = await db.account.findFirstOrThrow({
      where: { userId: created.userId },
    });
    expect(account.password).not.toContain(created.temporaryPassword);
  });

  it("refuses what the policy does not allow, and creates nothing", async () => {
    const investor = await createUser({
      termsAccepted: true,
      mfaEnabled: true,
    });
    const investorViewer = await activeViewer(investor.id);
    const attempts: [Viewer | null, UserRole, string[]][] = [
      [summitAdmin, UserRole.PLATFORM_ADMIN, []],
      [summitAdmin, UserRole.COUNTRY, []],
      [summitAdmin, UserRole.WBG_COORDINATOR, []],
      [summitAdmin, UserRole.INVESTOR, [C.a]],
      [investorViewer, UserRole.INVESTOR, []],
      [null, UserRole.INVESTOR, []],
    ];
    for (const [actor, role, countryIds] of attempts) {
      const email = uniqueEmail("refused");
      await expect(
        createAccount(
          actor,
          { email, name: "Nobody", role, countryIds },
          meta,
          { auth },
        ),
      ).rejects.toBeInstanceOf(AccountError);
      expect(await db.user.count({ where: { email } })).toBe(0);
    }
    // A country that does not exist.
    await expect(
      createAccount(
        summitAdmin,
        {
          email: uniqueEmail("ghost"),
          name: "Ghost",
          role: UserRole.COUNTRY,
          countryIds: ["it-acc-none"],
        },
        meta,
        { auth },
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses a second account for the same address", async () => {
    const existing = await createUser({});
    await expect(
      createAccount(
        platformAdmin,
        {
          email: existing.email,
          name: "Twin",
          role: UserRole.INVESTOR,
          countryIds: [],
        },
        meta,
        { auth },
      ),
    ).rejects.toMatchObject({ code: "exists" });
  });

  it("lets only platform admins create platform admins", () => {
    const request = { role: UserRole.PLATFORM_ADMIN, countryIds: [] };
    expect(canCreateAccount(platformAdmin, request)).toBe(true);
    expect(canCreateAccount(summitAdmin, request)).toBe(false);
  });
});

describe("first sign-in with a temporary password", () => {
  it("takes an investor through a new password and the investor acknowledgement before the pipeline", async () => {
    const created = await createAccount(
      summitAdmin,
      {
        email: uniqueEmail("investor"),
        name: "New Investor",
        role: UserRole.INVESTOR,
        countryIds: [],
      },
      meta,
      { auth },
    );

    // Email and password only: no second step (PLAN 0a.3).
    const { result, jar } = await signIn(
      created.email,
      created.temporaryPassword,
    );
    expect(result.status).toBe("signed-in");
    let session = await current(jar);
    expect(session?.stage).toBe("change-password");
    // No viewer, so no pipeline, before the steps are done.
    expect(await viewerFor(created.userId, gatePasswordOnly)).toBeNull();
    expect(await visibleProjects(null)).toEqual([]);

    // The temporary password itself is not accepted as the new one.
    await expect(
      changeTemporaryPassword(
        created.userId,
        session!.sessionId,
        created.temporaryPassword,
        meta,
        { auth },
      ),
    ).rejects.toMatchObject({ code: "same_password" });

    await changeTemporaryPassword(
      created.userId,
      session!.sessionId,
      NEW_PASSWORD,
      meta,
      { auth },
    );
    session = await current(jar);
    expect(session?.stage).toBe("investor-ack");
    expect(await viewerFor(created.userId, gatePasswordOnly)).toBeNull();

    await acceptInvestorAcknowledgement(created.userId, meta);
    session = await current(jar);
    expect(session?.stage).toBe("active");
    const viewer = await activeViewer(created.userId);
    // Published projects only, of every country.
    expect(await visibleProjects(viewer)).toEqual([P.aPub, P.bPub].sort());

    const user = await db.user.findUniqueOrThrow({
      where: { id: created.userId },
    });
    expect(user.mustChangePassword).toBe(false);
    expect(user.investorAckTextVersion).toBe(
      appConfig.investorAcknowledgement.version,
    );
    expect(user.investorAckAcceptedAt).not.toBeNull();
    const actions = (
      await db.auditEvent.findMany({
        where: { actorId: created.userId },
        select: { action: true, metadata: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "auth.login",
        "auth.password_change",
        "user.investor_ack",
      ]),
    );

    // The temporary password no longer works; the new one does.
    expect(
      (await signIn(created.email, created.temporaryPassword)).result.status,
    ).toBe("failed");
    expect((await signIn(created.email, NEW_PASSWORD)).result.status).toBe(
      "signed-in",
    );

    // Done once: a second "temporary password" change is refused.
    await expect(
      changeTemporaryPassword(
        created.userId,
        session!.sessionId,
        "Another-new-password-1",
        meta,
        { auth },
      ),
    ).rejects.toBeInstanceOf(AccountError);
  });

  it("ends the other sessions when the password changes, but keeps the current one", async () => {
    const created = await createAccount(
      summitAdmin,
      {
        email: uniqueEmail("two-tabs"),
        name: "Two Tabs",
        role: UserRole.SUMMIT_ADMIN,
        countryIds: [],
      },
      meta,
      { auth },
    );
    const first = await signIn(created.email, created.temporaryPassword);
    const second = await signIn(created.email, created.temporaryPassword);
    const session = await current(first.jar);
    await changeTemporaryPassword(
      created.userId,
      session!.sessionId,
      NEW_PASSWORD,
      meta,
      { auth },
    );
    expect((await current(first.jar))?.stage).toBe("terms");
    expect(await current(second.jar)).toBeNull();
  });

  it("refuses the investor acknowledgement for other roles", async () => {
    const country = await createUser({ role: UserRole.COUNTRY });
    await expect(
      acceptInvestorAcknowledgement(country.id, meta),
    ).rejects.toBeInstanceOf(AccountError);
  });
});

describe("new temporary password", () => {
  it("replaces the password, removes the authenticator, ends sessions and forces a change", async () => {
    const target = await createUser({ termsAccepted: true, mfaEnabled: true });
    await db.twoFactor.create({
      data: { userId: target.id, secret: "x", backupCodes: "y" },
    });
    const before = await signIn(target.email, PASSWORD);
    expect(before.result.status).toBe("second-step");

    const reset = await resetTemporaryPassword(summitAdmin, target.id, meta, {
      auth,
    });
    expect(reset.temporaryPassword).toMatch(TEMPORARY_PASSWORD_PATTERN);
    const user = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(user).toMatchObject({ mustChangePassword: true, mfaEnabled: false });
    expect(await db.twoFactor.count({ where: { userId: target.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);

    expect((await signIn(target.email, PASSWORD)).result.status).toBe("failed");
    const after = await signIn(target.email, reset.temporaryPassword);
    expect(after.result.status).toBe("signed-in");
    expect((await current(after.jar))?.stage).toBe("change-password");

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "user.password_reset", entityId: target.id },
    });
    expect(audit).toMatchObject({
      actorId: summitAdminId,
      metadata: { authenticatorRemoved: true },
    });
  });

  it("is refused for your own account, for a platform admin by a Summit admin, and for non-admins", async () => {
    const investor = await createUser({
      termsAccepted: true,
      mfaEnabled: true,
    });
    const investorViewer = await activeViewer(investor.id);
    await expect(
      resetTemporaryPassword(summitAdmin, summitAdminId, meta, { auth }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      resetTemporaryPassword(summitAdmin, platformAdminId, meta, { auth }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    // Investors cannot even find other accounts.
    await expect(
      resetTemporaryPassword(investorViewer, summitAdminId, meta, { auth }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      resetTemporaryPassword(platformAdmin, summitAdminId, meta, { auth }),
    ).resolves.toBeDefined();
    // Restore the Summit admin for the other tests (the reset forced a password change).
    await db.user.update({
      where: { id: summitAdminId },
      data: { mustChangePassword: false },
    });
  });
});

describe("cross-country isolation of handed-out accounts", () => {
  it("lets a country focal point see their own drafts but nothing of another country", async () => {
    const created = await createAccount(
      summitAdmin,
      {
        email: uniqueEmail("focal-a"),
        name: "Focal A",
        role: UserRole.COUNTRY,
        countryIds: [C.a],
      },
      meta,
      { auth },
    );
    await db.user.update({
      where: { id: created.userId },
      data: { mustChangePassword: false, termsAcceptedAt: new Date() },
    });
    const viewer = await activeViewer(created.userId);
    expect(await visibleProjects(viewer)).toEqual([P.aDraft, P.aPub].sort());
    expect(canManageAccounts(viewer)).toBe(false);
    expect(await listAccounts(viewer)).toEqual([]);
    await expect(
      createAccount(
        viewer,
        {
          email: uniqueEmail("x"),
          name: "X",
          role: UserRole.COUNTRY,
          countryIds: [C.a],
        },
        meta,
        {
          auth,
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("gives a WBG coordinator no drafts, no workspace, no other people and no account powers (default deny until M3/M5)", async () => {
    const created = await createAccount(
      summitAdmin,
      {
        email: uniqueEmail("coordinator"),
        name: "Coordinator",
        role: UserRole.WBG_COORDINATOR,
        countryIds: [C.a, C.b],
      },
      meta,
      { auth },
    );
    await db.user.update({
      where: { id: created.userId },
      data: { mustChangePassword: false, termsAcceptedAt: new Date() },
    });
    const viewer = await activeViewer(created.userId);
    const visible = await visibleProjects(viewer);
    expect(visible).not.toContain(P.aDraft);
    expect(visible).not.toContain(P.bDraft);
    expect(canUseWorkspace(viewer)).toBe(false);
    const people = await db.user.findMany({
      where: userWhere(viewer),
      select: { id: true },
    });
    expect(people.map((p) => p.id)).toEqual([created.userId]);
    expect(canManageAccounts(viewer)).toBe(false);
    await expect(
      resetTemporaryPassword(viewer, summitAdminId, meta, { auth }),
    ).rejects.toBeInstanceOf(AccountError);
  });

  it("lists every account for admins only", async () => {
    const all = await listAccounts(summitAdmin);
    expect(all.some((a) => a.id === platformAdminId)).toBe(true);
    // Summit admins see platform admins but may not reset them, nor themselves.
    expect(all.find((a) => a.id === platformAdminId)?.canReset).toBe(false);
    expect(all.find((a) => a.id === summitAdminId)?.canReset).toBe(false);
  });
});
