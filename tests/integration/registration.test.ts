// M13 (PLAN v0.4 0b.16 to 0b.21): investor and operator registration against real PostgreSQL. Proves that a
// registration waits for the Summit team unless it is on the pre-approved list AND REGISTRATION_AUTO_APPROVE is
// on, that public email domains never match, that only admins decide registrations and keep the pre-approved
// list, that every step is audited and the Summit mailbox told, and that countries see the demand for their own
// projects only (by organisation type, without requester names).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MeetingRequestStatus,
  MembershipRole,
  OrganisationType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import {
  addApprovedContacts,
  addApprovedOrganisation,
  listPendingRegistrations,
  listPreApproved,
  PreApprovalError,
} from "@/lib/admin/registrations";
import {
  decideRegistration,
  register,
  RegistrationDecisionError,
} from "@/lib/auth/service";
import { getCurrentSession } from "@/lib/auth/session";
import type { Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { MemoryMailer } from "@/lib/mail";
import { getProjectDemand } from "@/lib/requests/service";
import {
  actorFor,
  cleanUp,
  CookieJar,
  createUser,
  gatePasswordOnly,
  IT_DOMAIN,
  PASSWORD,
  requestHeaders,
  testAuth,
  uniqueEmail,
  viewerFor,
} from "./helpers";

const auth = testAuth({ SELF_REGISTRATION_ENABLED: "true" });
const SUMMIT = `summit-box@${IT_DOMAIN}`;
const ORG_DOMAIN = `fund-${randomUUID().slice(0, 8)}.${IT_DOMAIN}`;
const C = { a: "it-reg-a", b: "it-reg-b" } as const;

let mailer: MemoryMailer;
let admin: Viewer;
let investorViewer: Viewer;
let countryA: Viewer;

const details = {
  password: PASSWORD,
  name: "Reg Istrant",
  organisation: "IT Fund One",
  organisationType: OrganisationType.INVESTOR_FUND,
  jobTitle: "Partner",
};

function signUp(email: string, autoApprove: boolean) {
  return register({ email, ...details }, requestHeaders(), {
    auth,
    autoApprove,
    mailer,
    summitEmails: [SUMMIT],
  });
}

async function stageOf(result: Awaited<ReturnType<typeof signUp>>) {
  if (result.status !== "ok") return null;
  const jar = new CookieJar().store(result.headers);
  return (
    await getCurrentSession(jar.headers(), { auth, config: gatePasswordOnly })
  )?.stage;
}

async function statusOf(email: string) {
  return (
    await db.user.findUniqueOrThrow({
      where: { email },
      select: { status: true },
    })
  ).status;
}

async function audits(entityId: string) {
  return (
    await db.auditEvent.findMany({
      where: { entityId },
      orderBy: { at: "asc" },
      select: { action: true },
    })
  ).map((a) => a.action);
}

beforeAll(async () => {
  await cleanUp();
  mailer = new MemoryMailer();
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Reg A", iso3: "XRA" },
      { id: C.b, name: "IT Reg B", iso3: "XRB" },
    ],
  });
  admin = (await viewerFor(
    (await createUser({ role: UserRole.SUMMIT_ADMIN, termsAccepted: true })).id,
    gatePasswordOnly,
  ))!;
  investorViewer = (await viewerFor(
    (await createUser({ role: UserRole.INVESTOR, termsAccepted: true })).id,
    gatePasswordOnly,
  ))!;
  countryA = (await viewerFor(
    (
      await createUser({
        role: UserRole.COUNTRY,
        membershipRole: MembershipRole.FOCAL_POINT,
        countryId: C.a,
        termsAccepted: true,
      })
    ).id,
    gatePasswordOnly,
  ))!;
  await addApprovedOrganisation(admin, {
    name: "IT Fund One",
    domains: ORG_DOMAIN,
    source: "integration test",
  });
});

afterAll(cleanUp);

describe("registration", () => {
  it("creates an investor who waits for approval, tells the Summit mailbox and audits it", async () => {
    mailer.sent.length = 0;
    const email = uniqueEmail("reg-waits");
    const result = await signUp(email, true);
    expect(result).toMatchObject({
      status: "ok",
      accountStatus: UserStatus.PENDING_APPROVAL,
    });
    expect(await stageOf(result)).toBe("pending");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({
      role: UserRole.INVESTOR,
      status: UserStatus.PENDING_APPROVAL,
      organisation: "IT Fund One",
      organisationType: OrganisationType.INVESTOR_FUND,
      jobTitle: "Partner",
    });
    expect(await audits(user.id)).toContain("user.register");
    expect(await audits(user.id)).not.toContain("user.auto_approve");
    const [notice] = mailer.sent;
    expect(notice.to).toEqual([SUMMIT]);
    expect(notice.subject).toBe(
      "New registration waiting for approval: IT Fund One",
    );
    expect(notice.text).toContain("Not on the pre-approved list");
    expect(notice.text).toMatch(/\/admin\/accounts$/m);
  });

  it("lets a pre-approved registrant in at once only when auto-approval is on", async () => {
    const waits = `ada-${randomUUID().slice(0, 6)}@${ORG_DOMAIN}`;
    expect(await signUp(waits, false)).toMatchObject({
      accountStatus: UserStatus.PENDING_APPROVAL,
    });
    const queue = await listPendingRegistrations(admin);
    expect(queue.find((r) => r.email === waits)).toMatchObject({
      preApproved: true,
      preApproval: expect.stringContaining("IT Fund One"),
    });

    const straightIn = `bob-${randomUUID().slice(0, 6)}@${ORG_DOMAIN}`;
    const result = await signUp(straightIn, true);
    expect(result).toMatchObject({ accountStatus: UserStatus.ACTIVE });
    // Approved, so the next step is the investor acknowledgement (no pipeline before it).
    expect(await stageOf(result)).toBe("investor-ack");
    const id = result.status === "ok" ? result.userId : "";
    expect(await audits(id)).toEqual(
      expect.arrayContaining(["user.register", "user.auto_approve"]),
    );

    // An exact pre-approved person matches too, whatever their domain.
    const person = uniqueEmail("listed");
    await addApprovedContacts(admin, { emails: person, organisationId: null });
    expect(await signUp(person, true)).toMatchObject({
      accountStatus: UserStatus.ACTIVE,
    });
  });

  it("never pre-approves a public email domain", async () => {
    await expect(
      addApprovedOrganisation(admin, {
        name: "IT Public",
        domains: "gmail.com",
        source: "",
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    // Even if a public domain got into the database, it would not match.
    await db.approvedOrganisation.create({
      data: { name: "IT Sneaky", emailDomains: ["gmail.com"] },
    });
    const queue = await listPendingRegistrations(admin);
    expect(queue.every((r) => !r.email.endsWith("@gmail.com"))).toBe(true);
    const { preApprovalMatch } = await import("@/lib/auth/pre-approval");
    expect(
      preApprovalMatch("someone@gmail.com", {
        contacts: [],
        organisations: [{ name: "IT Sneaky", emailDomains: ["gmail.com"] }],
      }),
    ).toBeNull();
  });
});

describe("decisions", () => {
  it("are for admins only, once, and audited", async () => {
    const approveMe = uniqueEmail("approve-me");
    const rejectMe = uniqueEmail("reject-me");
    const a = await signUp(approveMe, false);
    const r = await signUp(rejectMe, false);
    const aId = a.status === "ok" ? a.userId : "";
    const rId = r.status === "ok" ? r.userId : "";

    for (const viewer of [investorViewer, countryA]) {
      await expect(
        decideRegistration(viewer, aId, "approve", requestHeaders()),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await statusOf(approveMe)).toBe(UserStatus.PENDING_APPROVAL);

    const adminActor = await actorFor(admin.id);
    await decideRegistration(adminActor, aId, "approve", requestHeaders(), {
      mailer,
      notifyRegistrant: false,
    });
    await decideRegistration(adminActor, rId, "reject", requestHeaders(), {
      mailer,
      notifyRegistrant: false,
    });
    expect(await statusOf(approveMe)).toBe(UserStatus.ACTIVE);
    expect(await statusOf(rejectMe)).toBe(UserStatus.REJECTED);
    expect(await audits(aId)).toContain("user.approve");
    expect(await audits(rId)).toContain("user.reject");
    // A rejected registration keeps seeing only the pending screen.
    expect(await stageOf(r)).toBe("pending");
    // Decisions are final.
    const again = await decideRegistration(
      adminActor,
      rId,
      "approve",
      requestHeaders(),
    ).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(RegistrationDecisionError);
    expect((again as RegistrationDecisionError).code).toBe("not_pending");
    expect(await statusOf(rejectMe)).toBe(UserStatus.REJECTED);
  });

  it("emails the registrant only when switched on", async () => {
    const email = uniqueEmail("told");
    const result = await signUp(email, false);
    const id = result.status === "ok" ? result.userId : "";
    mailer.sent.length = 0;
    await decideRegistration(
      await actorFor(admin.id),
      id,
      "approve",
      requestHeaders(),
      { mailer, notifyRegistrant: true },
    );
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toEqual([email]);
    expect(mailer.sent[0].subject).toContain("approved");
  });
});

describe("the pre-approved list", () => {
  it("is kept by admins only and every change is audited", async () => {
    for (const viewer of [investorViewer, countryA]) {
      await expect(
        addApprovedOrganisation(viewer, {
          name: "IT Nope",
          domains: "nope.example",
          source: "",
        }),
      ).rejects.toBeInstanceOf(PreApprovalError);
      await expect(listPreApproved(viewer)).rejects.toBeInstanceOf(
        PreApprovalError,
      );
      expect(await listPendingRegistrations(viewer)).toEqual([]);
    }
    const list = await listPreApproved(admin);
    const org = list.organisations.find((o) => o.name === "IT Fund One");
    expect(org?.emailDomains).toEqual([ORG_DOMAIN]);
    expect(await audits(org!.id)).toContain("approved_organisation.create");
  });
});

describe("demand counts for countries", () => {
  it("count the requests on the country's own projects by organisation type, without leaking other countries", async () => {
    await db.project.createMany({
      data: [
        {
          id: "it-reg-pa",
          countryId: C.a,
          title: "IT Reg A",
          sector: "Sludge",
        },
        {
          id: "it-reg-pb",
          countryId: C.b,
          title: "IT Reg B",
          sector: "Sludge",
        },
      ],
    });
    const investor = async (type: OrganisationType | null) => {
      const u = await createUser({ role: UserRole.INVESTOR });
      await db.user.update({
        where: { id: u.id },
        data: { organisationType: type },
      });
      return u.id;
    };
    const fund = await investor(OrganisationType.INVESTOR_FUND);
    const dfi = await investor(OrganisationType.DFI_MDB);
    const unknown = await investor(null);
    const request = (
      projectId: string,
      requesterId: string,
      status: MeetingRequestStatus,
    ) => ({
      projectId,
      requesterId,
      status,
      organisation: "IT Org",
      role: "Partner",
    });
    await db.meetingRequest.createMany({
      data: [
        request("it-reg-pa", fund, MeetingRequestStatus.PENDING),
        // Declined requests still show demand.
        request("it-reg-pa", dfi, MeetingRequestStatus.DECLINED),
        request("it-reg-pa", unknown, MeetingRequestStatus.ACCEPTED),
        // Withdrawn requests do not.
        request("it-reg-pa", dfi, MeetingRequestStatus.WITHDRAWN),
        request("it-reg-pb", fund, MeetingRequestStatus.PENDING),
      ],
    });
    const ids = ["it-reg-pa", "it-reg-pb"];

    const forA = await getProjectDemand(countryA, ids);
    expect([...forA.keys()]).toEqual(["it-reg-pa"]);
    expect(forA.get("it-reg-pa")).toEqual({
      total: 3,
      byType: [
        { key: "INVESTOR_FUND", label: "Investor or fund", count: 1 },
        { key: "DFI_MDB", label: "DFI or MDB", count: 1 },
        { key: "NOT_STATED", label: "Not stated", count: 1 },
      ],
    });
    // Investors see no country-side demand; admins see every project's.
    expect((await getProjectDemand(investorViewer, ids)).size).toBe(0);
    const all = await getProjectDemand(admin, ids);
    expect(all.get("it-reg-pb")?.total).toBe(1);
  });
});
