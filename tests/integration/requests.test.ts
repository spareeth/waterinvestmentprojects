// M5 (PLAN v0.3 F5, F6, F7): meeting requests against real PostgreSQL. Proves cross-country and cross-investor
// isolation for creating, listing, deciding, withdrawing and exporting; that a WBG coordinator only reads their own
// countries' requests; that decisions are final; that every write and export leaves its AuditEvent; and that the
// Summit mailbox is told of every request while focal point (WBG coordinator in cc) and investor emails go out only
// when switched on. The CSV export neutralises spreadsheet formulas.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryContactRole,
  MeetingRequestStatus,
  MembershipRole,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import type { Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { MemoryMailer } from "@/lib/mail";
import {
  createMeetingRequest,
  decideMeetingRequest,
  exportRequestsCsv,
  getRequestCounts,
  getRequestPanel,
  listInboxRequests,
  listMyRequests,
  REQUEST_AUDIT,
  RequestError,
  type RequestOptions,
  withdrawMeetingRequest,
} from "@/lib/requests/service";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-req-a", b: "it-req-b" } as const;
const P = {
  aPub: "it-req-p-a-pub",
  aPub2: "it-req-p-a-pub2",
  aDraft: "it-req-p-a-draft",
  bPub: "it-req-p-b-pub",
} as const;
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };
const SUMMIT = ["summit-team@it.example"];
const FOCAL_A_CONTACT = "focal-a-contact@it.example";
const WBG_A_CONTACT = "wbg-a-contact@it.example";

type Key =
  | "admin"
  | "focalA"
  | "memberA"
  | "focalB"
  | "wbgA"
  | "investor1"
  | "investor2";
const v = {} as Record<Key, Viewer>;
const email = {} as Record<Key, string>;

const quiet = { focalPoints: false, investor: false };
function opts(extra: Partial<RequestOptions> = {}): RequestOptions {
  return {
    meta,
    mailer: new MemoryMailer(),
    notify: quiet,
    summitRecipients: SUMMIT,
    ...extra,
  };
}

const input = (organisation = "Fictional Water Fund") => ({
  // Empty, as on requests made before the attendee fields: the account's name and email are used
  // (tests/integration/meetings.test.ts covers a typed attendee).
  contactName: "",
  contactEmail: "",
  organisation,
  role: "Investment director",
  note: "We would like to discuss the PPP structure.",
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RequestError) return error.code;
    throw error;
  }
  return "allowed";
}

async function auditActions(entityId: string): Promise<string[]> {
  const rows = await db.auditEvent.findMany({
    where: { entityId },
    orderBy: { at: "asc" },
    select: { action: true },
  });
  return rows.map((r) => r.action);
}

/** Ids of requests created in this file, by label. */
const R: Record<string, string> = {};

beforeAll(async () => {
  await cleanUp();
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Requests A", iso3: "XRA" },
      { id: C.b, name: "IT Requests B", iso3: "XRB" },
    ],
  });
  const now = new Date();
  await db.project.createMany({
    data: [
      {
        id: P.aPub,
        countryId: C.a,
        title: "IT Request Plant A",
        sector: "Desalination",
        status: ProjectStatus.PUBLISHED,
        publishedAt: now,
      },
      {
        id: P.aPub2,
        countryId: C.a,
        title: "IT Request Network A",
        sector: "Water supply",
        status: ProjectStatus.PUBLISHED,
        publishedAt: now,
      },
      {
        id: P.aDraft,
        countryId: C.a,
        title: "IT Request Draft A",
        sector: "Wastewater",
        status: ProjectStatus.DRAFT,
      },
      {
        id: P.bPub,
        countryId: C.b,
        title: "IT Request Plant B",
        sector: "Desalination",
        status: ProjectStatus.PUBLISHED,
        publishedAt: now,
      },
    ],
  });
  await db.countryContact.createMany({
    data: [
      {
        countryId: C.a,
        name: "Focal A",
        email: FOCAL_A_CONTACT,
        role: CountryContactRole.FOCAL_POINT,
      },
      {
        countryId: C.a,
        name: "Coordinator A",
        email: WBG_A_CONTACT,
        role: CountryContactRole.WBG_COORDINATOR,
      },
    ],
  });
  const make = async (
    key: Key,
    role: UserRole,
    membershipRole?: MembershipRole,
    countryId?: string,
  ) => {
    const u = await createUser({
      role,
      membershipRole,
      countryId,
      termsAccepted: true,
      mfaEnabled: true,
    });
    // createUser (termsAccepted) also records the current investor acknowledgement (M2).
    if (role === UserRole.INVESTOR) {
      await db.user.update({
        where: { id: u.id },
        data: {
          organisation: "Fictional Water Fund",
          jobTitle: "Investment director",
        },
      });
    }
    v[key] = (await viewerFor(u.id))!;
    email[key] = u.email;
  };
  await make("admin", UserRole.SUMMIT_ADMIN);
  await make("focalA", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  await make("memberA", UserRole.COUNTRY, MembershipRole.MEMBER, C.a);
  await make("focalB", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  await make("wbgA", UserRole.WBG_COORDINATOR, MembershipRole.MEMBER, C.a);
  await make("investor1", UserRole.INVESTOR);
  await make("investor2", UserRole.INVESTOR);
  for (const key of Object.keys(v) as Key[]) {
    expect(v[key], `${key} must be an active viewer`).toBeTruthy();
  }
});

afterAll(async () => {
  await cleanUp();
});

describe("creating a request", () => {
  it("lets an investor request a meeting on a published project, audits it and tells the Summit mailbox", async () => {
    const mailer = new MemoryMailer();
    const { id } = await createMeetingRequest(
      v.investor1,
      P.aPub,
      input(),
      opts({ mailer }),
    );
    R.i1a = id;
    const row = await db.meetingRequest.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      requesterId: v.investor1.id,
      projectId: P.aPub,
      organisation: "Fictional Water Fund",
      role: "Investment director",
      status: MeetingRequestStatus.PENDING,
      decidedById: null,
    });
    expect(await auditActions(id)).toContain(REQUEST_AUDIT.CREATE);
    // Only the Summit notice: focal point emails are switched off.
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toEqual(SUMMIT);
    expect(mailer.sent[0].text).toContain(email.investor1);
  });

  it("emails the focal point with the WBG coordinator in copy when switched on", async () => {
    const mailer = new MemoryMailer();
    const { id } = await createMeetingRequest(
      v.investor2,
      P.aPub,
      input("Second Fictional Fund"),
      opts({ mailer, notify: { focalPoints: true, investor: false } }),
    );
    R.i2a = id;
    expect(mailer.sent).toHaveLength(2);
    const focal = mailer.sent.find((m) => m.to.includes(FOCAL_A_CONTACT));
    expect(focal?.cc).toEqual([WBG_A_CONTACT]);
    // The focal point sees the investor's address in the portal, not in the email.
    expect(focal?.text).not.toContain(email.investor2);
  });

  it("refuses a second open request by the same investor on the same project", async () => {
    expect(
      await refusal(createMeetingRequest(v.investor1, P.aPub, input(), opts())),
    ).toBe("already_requested");
  });

  it("allows many requests across projects (no ranking, no limit)", async () => {
    R.i1a2 = (
      await createMeetingRequest(v.investor1, P.aPub2, input(), opts())
    ).id;
    R.i1b = (
      await createMeetingRequest(
        v.investor1,
        P.bPub,
        input('=HYPERLINK("http://evil.example")'),
        opts(),
      )
    ).id;
    R.i2b = (
      await createMeetingRequest(v.investor2, P.bPub, input(), opts())
    ).id;
  });

  it("refuses drafts, unknown projects and anyone who is not an investor", async () => {
    expect(
      await refusal(
        createMeetingRequest(v.investor1, P.aDraft, input(), opts()),
      ),
    ).toBe("not_found");
    expect(
      await refusal(
        createMeetingRequest(v.investor1, "it-req-missing", input(), opts()),
      ),
    ).toBe("not_found");
    for (const key of ["admin", "focalA", "focalB", "wbgA"] as const) {
      expect(
        await refusal(createMeetingRequest(v[key], P.bPub, input(), opts())),
      ).toBe("not_found");
    }
    expect(
      await db.meetingRequest.count({ where: { projectId: P.aDraft } }),
    ).toBe(0);
  });

  it("shows the request panel only to investors, with their open request", async () => {
    const panel = await getRequestPanel(v.investor1, P.aPub);
    expect(panel?.open?.id).toBe(R.i1a);
    expect(panel?.defaults.organisation).toBe("Fictional Water Fund");
    expect(await getRequestPanel(v.investor1, P.aDraft)).toBeNull();
    expect(await getRequestPanel(v.focalA, P.aPub)).toBeNull();
  });
});

describe("listing", () => {
  it("shows an investor only their own requests", async () => {
    const mine1 = (await listMyRequests(v.investor1, opts())).map((r) => r.id);
    const mine2 = (await listMyRequests(v.investor2, opts())).map((r) => r.id);
    expect(mine1.sort()).toEqual([R.i1a, R.i1a2, R.i1b].sort());
    expect(mine2.sort()).toEqual([R.i2a, R.i2b].sort());
    expect(await listInboxRequests(v.investor1)).toEqual([]);
  });

  it("shows a country only requests on its own projects", async () => {
    const a = (await listInboxRequests(v.focalA)).map((r) => r.id);
    const b = (await listInboxRequests(v.focalB)).map((r) => r.id);
    expect(a.sort()).toEqual([R.i1a, R.i2a, R.i1a2].sort());
    expect(b.sort()).toEqual([R.i1b, R.i2b].sort());
    // A filter for another country never widens the view.
    expect(await listInboxRequests(v.focalA, { countryId: C.b })).toEqual([]);
  });

  it("lets a WBG coordinator read their own countries' requests without deciding", async () => {
    const rows = await listInboxRequests(v.wbgA);
    expect(rows.map((r) => r.id).sort()).toEqual([R.i1a, R.i2a, R.i1a2].sort());
    expect(rows.every((r) => !r.canDecide)).toBe(true);
  });

  it("shows admins every country and counts pending requests", async () => {
    const ids = (await listInboxRequests(v.admin)).map((r) => r.id);
    for (const id of Object.values(R)) expect(ids).toContain(id);
    const counts = await getRequestCounts(v.focalA);
    expect(counts).toEqual({ total: 3, pending: 3, newPending: 3 });
    expect(await getRequestCounts(v.investor1)).toEqual({
      total: 0,
      pending: 0,
      newPending: 0,
    });
  });
});

describe("deciding", () => {
  it("refuses other countries, WBG coordinators and investors", async () => {
    expect(
      await refusal(decideMeetingRequest(v.focalB, R.i1a, "ACCEPTED", opts())),
    ).toBe("not_found");
    expect(
      await refusal(
        decideMeetingRequest(v.investor1, R.i1a, "ACCEPTED", opts()),
      ),
    ).toBe("not_found");
    expect(
      await refusal(decideMeetingRequest(v.wbgA, R.i1a, "ACCEPTED", opts())),
    ).toBe("forbidden");
    const row = await db.meetingRequest.findUniqueOrThrow({
      where: { id: R.i1a },
    });
    expect(row.status).toBe(MeetingRequestStatus.PENDING);
  });

  it("lets the focal point accept, records who and when, and keeps the decision final", async () => {
    const mailer = new MemoryMailer();
    await decideMeetingRequest(v.focalA, R.i1a, "ACCEPTED", opts({ mailer }));
    const row = await db.meetingRequest.findUniqueOrThrow({
      where: { id: R.i1a },
    });
    expect(row.status).toBe(MeetingRequestStatus.ACCEPTED);
    expect(row.decidedById).toBe(v.focalA.id);
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(await auditActions(R.i1a)).toContain(REQUEST_AUDIT.ACCEPT);
    // A confirmed meeting is always emailed, even with the switches off (user decision, 22 Nov): the investor,
    // the focal point (WBG coordinator in copy) and the Summit mailbox.
    expect(mailer.sent).toHaveLength(3);
    const investorMail = mailer.sent.find((m) =>
      m.subject.includes("accepted"),
    );
    expect(investorMail?.to).toEqual([email.investor1]);
    const countryMail = mailer.sent.find((m) => m.to.includes(FOCAL_A_CONTACT));
    expect(countryMail?.cc).toEqual([WBG_A_CONTACT]);
    expect(countryMail?.subject).toContain("meeting confirmed");
    expect(mailer.sent.some((m) => m.to.includes(SUMMIT[0]))).toBe(true);
    expect(
      await refusal(decideMeetingRequest(v.focalA, R.i1a, "DECLINED", opts())),
    ).toBe("not_pending");
  });

  it("lets any country user of the project's country decide (user decision, M3)", async () => {
    await decideMeetingRequest(v.memberA, R.i1a2, "DECLINED", opts());
    const row = await db.meetingRequest.findUniqueOrThrow({
      where: { id: R.i1a2 },
    });
    expect(row.status).toBe(MeetingRequestStatus.DECLINED);
    expect(row.decidedById).toBe(v.memberA.id);
  });

  it("lets an admin decide for a country and emails the investor when switched on", async () => {
    const mailer = new MemoryMailer();
    await decideMeetingRequest(
      v.admin,
      R.i2b,
      "DECLINED",
      opts({ mailer, notify: { focalPoints: false, investor: true } }),
    );
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toEqual([email.investor2]);
    expect(mailer.sent[0].subject).toContain("declined");
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { entityId: R.i2b, action: REQUEST_AUDIT.DECLINE },
    });
    expect(audit.actorId).toBe(v.admin.id);
    expect(audit.metadata).toMatchObject({ onBehalf: true, countryId: C.b });
  });
});

describe("withdrawing", () => {
  it("refuses other investors and the country", async () => {
    expect(
      await refusal(withdrawMeetingRequest(v.investor2, R.i1a, opts())),
    ).toBe("not_found");
    expect(await refusal(withdrawMeetingRequest(v.focalA, R.i1a, opts()))).toBe(
      "forbidden",
    );
  });

  it("lets the investor withdraw an accepted request, once", async () => {
    const mailer = new MemoryMailer();
    await withdrawMeetingRequest(v.investor1, R.i1a, opts({ mailer }));
    // Always emailed (user decision, 22 Nov): the investor, the country and the Summit mailbox.
    expect(mailer.sent).toHaveLength(3);
    expect(
      mailer.sent.find((m) => m.to.includes(email.investor1))?.subject,
    ).toContain("you withdrew");
    const countryMail = mailer.sent.find((m) => m.to.includes(FOCAL_A_CONTACT));
    expect(countryMail?.cc).toEqual([WBG_A_CONTACT]);
    expect(countryMail?.text).toContain(
      "cancelled the confirmed bilateral meeting",
    );
    const row = await db.meetingRequest.findUniqueOrThrow({
      where: { id: R.i1a },
    });
    expect(row.status).toBe(MeetingRequestStatus.WITHDRAWN);
    expect(await auditActions(R.i1a)).toContain(REQUEST_AUDIT.WITHDRAW);
    expect(
      await refusal(withdrawMeetingRequest(v.investor1, R.i1a, opts())),
    ).toBe("not_open");
    // A declined request cannot be withdrawn either.
    expect(
      await refusal(withdrawMeetingRequest(v.investor2, R.i2b, opts())),
    ).toBe("not_open");
  });

  it("lets the investor request again after withdrawing", async () => {
    R.i1aAgain = (
      await createMeetingRequest(v.investor1, P.aPub, input(), opts())
    ).id;
    expect(R.i1aAgain).not.toBe(R.i1a);
  });
});

describe("exporting", () => {
  const ids = (csv: string) =>
    csv
      .split("\r\n")
      .slice(1)
      .filter(Boolean)
      .map((line) => line.split(",")[0]);

  it("gives a focal point only their own country's rows and audits the export", async () => {
    const before = await db.auditEvent.count({
      where: { actorId: v.focalA.id, action: REQUEST_AUDIT.EXPORT },
    });
    const { csv, count } = await exportRequestsCsv(v.focalA, {}, opts());
    expect(ids(csv).sort()).toEqual([R.i1a, R.i2a, R.i1a2, R.i1aAgain].sort());
    expect(count).toBe(4);
    expect(csv).not.toContain("IT Request Plant B");
    expect(
      await db.auditEvent.count({
        where: { actorId: v.focalA.id, action: REQUEST_AUDIT.EXPORT },
      }),
    ).toBe(before + 1);
  });

  it("lets a WBG coordinator export their own countries only", async () => {
    const { csv } = await exportRequestsCsv(v.wbgA, {}, opts());
    expect(ids(csv)).not.toContain(R.i1b);
    expect(ids(csv)).toContain(R.i2a);
  });

  it("refuses investors", async () => {
    expect(await refusal(exportRequestsCsv(v.investor1, {}, opts()))).toBe(
      "forbidden",
    );
  });

  it("gives admins every country, filters by country and neutralises formulas", async () => {
    const all = await exportRequestsCsv(v.admin, {}, opts());
    for (const id of Object.values(R)) expect(ids(all.csv)).toContain(id);
    const b = await exportRequestsCsv(v.admin, { countryId: C.b }, opts());
    expect(ids(b.csv).sort()).toEqual([R.i1b, R.i2b].sort());
    expect(b.csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(b.csv).not.toMatch(/,=HYPERLINK/);
  });
});
