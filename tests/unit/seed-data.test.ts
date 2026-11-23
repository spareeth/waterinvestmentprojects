// @vitest-environment node
// Checks the shape and integrity of the fictional seed data without a database.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CountryContactRole,
  MeetingRequestStatus,
  MembershipRole,
  ProjectStatus,
  SlotStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { appConfig } from "@/lib/config";
import {
  INVESTOR_WITHOUT_ACK,
  SLOT_MINUTES,
  gst,
  seedData,
} from "../../prisma/seed/data";
import { buildPlaceholderPdf, escapePdfText } from "../../prisma/seed/pdf";

const {
  countries,
  users,
  memberships,
  invitations,
  uploadLinks,
  submissions,
  countryContacts,
  projects,
  documents,
  documentFiles,
  meetingRequests,
  rooms,
  slots,
  auditEvents,
} = seedData;

const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((r) => [r.id, r]));
const userById = byId(users);
const projectById = byId(projects);
const documentById = byId(documents);
const requestById = byId(meetingRequests);
const submissionById = byId(submissions);
const linkById = byId(uploadLinks);

describe("seed data: identity and fiction", () => {
  it("uses unique, recognisable seed ids in every collection", () => {
    const collections = {
      countries,
      users,
      invitations,
      uploadLinks,
      submissions,
      countryContacts,
      projects,
      documents,
      meetingRequests,
      rooms,
      slots,
      auditEvents,
    };
    for (const [name, rows] of Object.entries(collections)) {
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size, `${name} ids are unique`).toBe(ids.length);
      for (const id of ids) expect(id, `${name} id`).toMatch(/^seed-/);
    }
  });

  it("has fictional Countries A to E with user-assigned ISO codes", () => {
    expect(countries.map((c) => c.name)).toEqual([
      "Country A",
      "Country B",
      "Country C",
      "Country D",
      "Country E",
    ]);
    for (const c of countries) expect(c.iso3).toMatch(/^XA[A-Z]$/);
  });

  it("uses only reserved .example email domains and documentation IP ranges", () => {
    const emails = [
      ...users.map((u) => u.email),
      ...invitations.map((i) => i.email),
      ...submissions.map((s) => s.uploaderEmail),
      ...countryContacts.map((c) => c.email),
    ];
    for (const email of emails) expect(email).toMatch(/@[a-z0-9.-]+\.example$/);
    expect(new Set(users.map((u) => u.email)).size).toBe(users.length);
    const ips = [...submissions, ...auditEvents]
      .map((r) => r.ip)
      .filter(Boolean);
    for (const ip of ips)
      expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
  });

  it("has no em dashes in any seed text", () => {
    expect(
      JSON.stringify({ ...seedData, documentFiles: undefined }),
    ).not.toContain("—");
  });
});

describe("seed data: users and memberships", () => {
  it("covers every role, including pending and deactivated accounts", () => {
    for (const role of Object.values(UserRole)) {
      expect(
        users.some((u) => u.role === role && u.status === UserStatus.ACTIVE),
        role,
      ).toBe(true);
    }
    expect(users.some((u) => u.status === UserStatus.PENDING_APPROVAL)).toBe(
      true,
    );
    expect(users.some((u) => u.status === UserStatus.DEACTIVATED)).toBe(true);
  });

  it("only gives country memberships to COUNTRY users and WBG coordinators, and each of them has at least one", () => {
    const linkedRoles: UserRole[] = [
      UserRole.COUNTRY,
      UserRole.WBG_COORDINATOR,
    ];
    for (const m of memberships) {
      expect(linkedRoles).toContain(userById.get(m.userId)?.role);
      expect(countries.some((c) => c.id === m.countryId)).toBe(true);
    }
    for (const u of users.filter((u) => u.role === UserRole.COUNTRY)) {
      expect(memberships.filter((m) => m.userId === u.id)).toHaveLength(1);
    }
    for (const u of users.filter((u) => u.role === UserRole.WBG_COORDINATOR)) {
      const own = memberships.filter((m) => m.userId === u.id);
      expect(own.length).toBeGreaterThan(0);
      // Their countries match their WBG coordinator contacts.
      for (const m of own) {
        expect(
          countryContacts.some(
            (c) =>
              c.userId === u.id &&
              c.countryId === m.countryId &&
              c.role === CountryContactRole.WBG_COORDINATOR,
          ),
          m.countryId,
        ).toBe(true);
      }
    }
  });

  it("lets demo users in with the demo password, and leaves one investor to show the acknowledgement", () => {
    expect(users.every((u) => !u.mustChangePassword)).toBe(true);
    const activeInvestors = users.filter(
      (u) => u.role === UserRole.INVESTOR && u.status === UserStatus.ACTIVE,
    );
    const without = activeInvestors.filter((u) => !u.investorAckAcceptedAt);
    expect(without.map((u) => u.id)).toEqual([INVESTOR_WITHOUT_ACK]);
    for (const u of activeInvestors) {
      if (u.id === INVESTOR_WITHOUT_ACK) continue;
      expect(u.investorAckTextVersion).toBe(
        appConfig.investorAcknowledgement.version,
      );
    }
    for (const u of users.filter((u) => u.role !== UserRole.INVESTOR)) {
      expect(u.investorAckTextVersion).toBeNull();
    }
  });

  it("has a focal point and a member for at least two countries", () => {
    const withBoth = countries.filter((c) => {
      const roles = memberships
        .filter((m) => m.countryId === c.id)
        .map((m) => m.role);
      return (
        roles.includes(MembershipRole.FOCAL_POINT) &&
        roles.includes(MembershipRole.MEMBER)
      );
    });
    expect(withBoth.length).toBeGreaterThanOrEqual(2);
  });

  it("has invitations that reference real inviters and store only a token hash", () => {
    for (const inv of invitations) {
      expect(userById.has(inv.invitedById)).toBe(true);
      expect(inv.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      if (inv.role === UserRole.COUNTRY) expect(inv.countryId).not.toBeNull();
    }
  });
});

describe("seed data: upload links, submissions and country contacts", () => {
  it("has only revoked upload links, without a token hash in the repository", () => {
    expect(uploadLinks.length).toBeGreaterThan(0);
    for (const link of uploadLinks) {
      expect(link.revokedAt, link.id).toBeInstanceOf(Date);
      expect("tokenHash" in link, link.id).toBe(false);
      expect(userById.get(link.createdById)?.role).toBe(UserRole.SUMMIT_ADMIN);
    }
    expect(uploadLinks.filter((l) => l.countryId === null)).toHaveLength(1);
  });

  it("records each submission's acknowledgement version and time, with a link or as a portal upload", () => {
    const versions = [
      appConfig.uploadAcknowledgement.version,
      appConfig.uploadAcknowledgementOnBehalf.version,
    ];
    for (const s of submissions) {
      expect(versions, s.id).toContain(s.ackTextVersion);
      expect(s.ackAcceptedAt).toBeInstanceOf(Date);
      if (s.uploadLinkId === null) {
        // Portal workspace upload: the uploader is a seed account.
        expect(
          users.some((u) => u.email === s.uploaderEmail),
          s.id,
        ).toBe(true);
      } else {
        const link = linkById.get(s.uploadLinkId);
        expect(link, s.id).toBeDefined();
        expect(s.ackTextVersion).toBe(appConfig.uploadAcknowledgement.version);
        // A country link fixes the country; the generic link lets the uploader choose.
        if (link!.countryId !== null) expect(s.countryId).toBe(link!.countryId);
      }
    }
    expect(submissions.some((s) => s.uploadLinkId === null)).toBe(true);
  });

  it("makes every link uploader a focal point contact of their country, and gives every country a WBG coordinator", () => {
    for (const s of submissions.filter((s) => s.uploadLinkId !== null)) {
      expect(
        countryContacts.some(
          (c) =>
            c.countryId === s.countryId &&
            c.email === s.uploaderEmail.toLowerCase() &&
            c.role === CountryContactRole.FOCAL_POINT,
        ),
        s.id,
      ).toBe(true);
    }
    for (const country of countries) {
      expect(
        countryContacts.some(
          (c) =>
            c.countryId === country.id &&
            c.role === CountryContactRole.WBG_COORDINATOR,
        ),
        country.id,
      ).toBe(true);
    }
    const keys = countryContacts.map(
      (c) => `${c.countryId}|${c.email}|${c.role}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of countryContacts) {
      expect(c.email).toBe(c.email.toLowerCase());
      if (c.userId) expect(userById.get(c.userId)?.email).toBe(c.email);
    }
  });
});

describe("seed data: projects and documents", () => {
  it("has 8 to 10 projects, mostly PUBLISHED, with some DRAFT", () => {
    expect(projects.length).toBeGreaterThanOrEqual(8);
    expect(projects.length).toBeLessThanOrEqual(10);
    const published = projects.filter(
      (p) => p.status === ProjectStatus.PUBLISHED,
    );
    expect(published.length).toBeGreaterThan(projects.length / 2);
    expect(projects.some((p) => p.status === ProjectStatus.DRAFT)).toBe(true);
    expect(new Set(projects.map((p) => p.sector)).size).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("has no tiers and none of the fields PLAN v0.3 removed", () => {
    for (const p of projects) {
      for (const removed of [
        "tier",
        "name",
        "tenderTimeline",
        "documentsPrepared",
        "feedbackSought",
        "revenueModel",
        "counterparty",
      ]) {
        expect(removed in p, `${p.id}.${removed}`).toBe(false);
      }
      expect(p.title.length).toBeGreaterThan(3);
    }
    expect(JSON.stringify(projects)).not.toMatch(/tier/i);
  });

  it("keeps publishedAt consistent with status and sizes in order", () => {
    for (const p of projects) {
      expect(countries.some((c) => c.id === p.countryId)).toBe(true);
      if (p.status === ProjectStatus.DRAFT) expect(p.publishedAt).toBeNull();
      else expect(p.publishedAt).toBeInstanceOf(Date);
      expect(p.sizeMinUsd).toBeLessThanOrEqual(p.sizeMaxUsd);
    }
  });

  it("stores every document with a Submission of the same country, given no later than the upload", () => {
    for (const doc of documents) {
      const s = submissionById.get(doc.submissionId);
      expect(s, doc.id).toBeDefined();
      expect(s!.countryId).toBe(projectById.get(doc.projectId)?.countryId);
      expect(s!.ackAcceptedAt.getTime()).toBeLessThanOrEqual(
        doc.uploadedAt.getTime(),
      );
      // Link files have no portal uploader; portal files name the account whose consent the Submission holds.
      if (s!.uploadLinkId === null) {
        expect(userById.get(doc.uploadedById!)?.email).toBe(s!.uploaderEmail);
      } else {
        expect(doc.uploadedById).toBeNull();
      }
    }
  });

  it("links projects created through an upload link to that submission", () => {
    for (const p of projects.filter((p) => p.submissionId !== null)) {
      const s = submissionById.get(p.submissionId!);
      expect(s?.uploadLinkId, p.id).not.toBeNull();
      expect(s?.countryId).toBe(p.countryId);
    }
  });

  it("has teasers only: no extra material, data room or grants (PLAN v0.3, M3)", () => {
    for (const d of documents) expect(d.kind, d.id).toBe("TEASER");
    expect(Object.keys(seedData)).not.toContain("projectGrants");
    expect(Object.keys(seedData)).not.toContain("pipelineCountries");
    for (const u of users) expect(u).not.toHaveProperty("pipelineScope");
  });

  it("published projects only after a teaser was uploaded", () => {
    for (const p of projects.filter((p) => p.status !== ProjectStatus.DRAFT)) {
      expect(
        documents.some(
          (d) =>
            d.projectId === p.id &&
            d.kind === "TEASER" &&
            d.uploadedAt <= p.publishedAt!,
        ),
        p.id,
      ).toBe(true);
    }
  });

  it("has documents whose hash and size match the generated placeholder PDF", () => {
    for (const doc of documents) {
      const bytes = documentFiles.get(doc.blobKey);
      expect(bytes, doc.id).toBeDefined();
      expect(doc.sizeBytes).toBe(bytes!.byteLength);
      expect(doc.sha256).toBe(
        createHash("sha256").update(bytes!).digest("hex"),
      );
      expect(new TextDecoder().decode(bytes!.slice(0, 8))).toBe("%PDF-1.4");
      expect(projectById.has(doc.projectId)).toBe(true);
      if (doc.uploadedById !== null)
        expect(userById.has(doc.uploadedById)).toBe(true);
    }
    expect(new Set(documents.map((d) => d.blobKey)).size).toBe(
      documents.length,
    );
  });

  it("links superseded versions to a newer version of the same project", () => {
    const superseded = documents.filter((d) => d.supersededById);
    expect(superseded.length).toBeGreaterThan(0);
    for (const old of superseded) {
      const next = documentById.get(old.supersededById!);
      expect(next?.projectId).toBe(old.projectId);
      expect(next!.version).toBeGreaterThan(old.version);
    }
  });
});

describe("seed data: meeting requests and slots", () => {
  it("has requests in every status, only from investors, only on published projects", () => {
    for (const status of Object.values(MeetingRequestStatus)) {
      expect(
        meetingRequests.some((r) => r.status === status),
        status,
      ).toBe(true);
    }
    for (const r of meetingRequests) {
      expect(userById.get(r.requesterId)?.role).toBe(UserRole.INVESTOR);
      expect(projectById.get(r.projectId)?.status).toBe(
        ProjectStatus.PUBLISHED,
      );
    }
  });

  it("records who decided: an admin or a user of the project's country", () => {
    for (const r of meetingRequests) {
      const decided =
        r.status === MeetingRequestStatus.ACCEPTED ||
        r.status === MeetingRequestStatus.DECLINED;
      if (!decided) {
        expect(r.decidedById).toBeNull();
        expect(r.decidedAt).toBeNull();
        continue;
      }
      expect(r.decidedAt).toBeInstanceOf(Date);
      const decider = userById.get(r.decidedById!);
      if (decider?.role !== UserRole.SUMMIT_ADMIN) {
        const countryId = projectById.get(r.projectId)?.countryId;
        expect(decider?.role).toBe(UserRole.COUNTRY);
        expect(
          memberships.some(
            (m) => m.userId === r.decidedById && m.countryId === countryId,
          ),
        ).toBe(true);
      }
    }
  });

  it("has two rooms with 30-minute slots on 8, 9 and 10 Dec, 09:00 to 19:00, only", () => {
    expect(rooms.map((r) => [r.name, r.capacity])).toEqual([
      ["Room 1 - Al Jimi", 22],
      ["Room 2 - Shawka", 10],
    ]);
    for (const s of slots) {
      expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(
        SLOT_MINUTES * 60_000,
      );
      const inDay8 =
        s.startsAt >= gst("2026-12-08T09:00") &&
        s.endsAt <= gst("2026-12-08T19:00");
      const inDay9 =
        s.startsAt >= gst("2026-12-09T09:00") &&
        s.endsAt <= gst("2026-12-09T19:00");
      const inDay10 =
        s.startsAt >= gst("2026-12-10T09:00") &&
        s.endsAt <= gst("2026-12-10T19:00");
      expect(inDay8 || inDay9 || inDay10, s.id).toBe(true);
    }
    for (const room of rooms) {
      const starts = slots
        .filter((s) => s.roomId === room.id)
        .map((s) => s.startsAt.getTime());
      expect(new Set(starts).size).toBe(starts.length);
      expect(starts).toHaveLength(20 + 20 + 20);
    }
  });

  it("books slots for accepted requests and holds them for pending ones, one slot per request", () => {
    const linked = slots.filter((s) => s.meetingRequestId);
    expect(linked.some((s) => s.status === SlotStatus.BOOKED)).toBe(true);
    expect(linked.some((s) => s.status === SlotStatus.HELD)).toBe(true);
    for (const s of slots) {
      if (s.status === SlotStatus.OPEN) expect(s.meetingRequestId).toBeNull();
      else if (s.status === SlotStatus.BLOCKED) {
        // 23 Nov: blocked by the Summit team, held by no request, with its reason.
        expect(s.meetingRequestId).toBeNull();
        expect(s.blockedReason).toBeTruthy();
      } else
        expect(requestById.get(s.meetingRequestId!)?.status).toBe(
          s.status === SlotStatus.BOOKED
            ? MeetingRequestStatus.ACCEPTED
            : MeetingRequestStatus.PENDING,
        );
    }
    // Nobody has two meetings at once: neither an investor nor a country.
    const projectCountry = new Map(projects.map((p) => [p.id, p.countryId]));
    for (const key of ["requesterId", "country"] as const) {
      const seen = new Set<string>();
      for (const s of linked) {
        const r = requestById.get(s.meetingRequestId!)!;
        const who =
          key === "country" ? projectCountry.get(r.projectId) : r.requesterId;
        const id = `${who}@${s.startsAt.toISOString()}`;
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
    const requestIds = linked.map((s) => s.meetingRequestId);
    expect(new Set(requestIds).size).toBe(requestIds.length);
    expect(slots.some((s) => s.status === SlotStatus.BLOCKED)).toBe(true);
  });

  it("keeps audit events pointing at real actors, with one anonymous failed login", () => {
    for (const e of auditEvents) {
      if (e.actorId !== null) expect(userById.has(e.actorId)).toBe(true);
    }
    expect(
      auditEvents.some(
        (e) => e.actorId === null && e.action === "auth.login_failed",
      ),
    ).toBe(true);
  });
});

describe("placeholder PDF builder", () => {
  it("escapes PDF string characters and drops non-ASCII", () => {
    expect(escapePdfText("a (b) \\ c–d")).toBe("a \\(b\\) \\\\ c?d");
  });

  it("produces deterministic bytes with a correct cross-reference table", () => {
    const input = {
      title: "Test (title)",
      subtitle: "Sub",
      lines: ["One", "Two"],
    };
    const a = buildPlaceholderPdf(input);
    const b = buildPlaceholderPdf(input);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);

    const text = new TextDecoder().decode(a);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [
      ...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm),
    ].map((m) => Number(m[1]));
    expect(entries).toHaveLength(6);
    entries.forEach((offset, i) => {
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(
        `${i + 1} 0 obj`,
      );
    });
  });
});
