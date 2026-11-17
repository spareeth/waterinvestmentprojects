// @vitest-environment node
// Checks the shape and integrity of the fictional seed data without a database.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MeetingRequestStatus,
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  SlotStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { SLOT_MINUTES, gst, seedData } from "../../prisma/seed/data";
import { buildPlaceholderPdf, escapePdfText } from "../../prisma/seed/pdf";

const {
  countries,
  users,
  memberships,
  pipelineCountries,
  invitations,
  projects,
  documents,
  documentFiles,
  acknowledgements,
  meetingRequests,
  rooms,
  slots,
  projectGrants,
  auditEvents,
} = seedData;

const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((r) => [r.id, r]));
const userById = byId(users);
const projectById = byId(projects);
const documentById = byId(documents);
const requestById = byId(meetingRequests);

describe("seed data: identity and fiction", () => {
  it("uses unique, recognisable seed ids in every collection", () => {
    const collections = {
      countries,
      users,
      invitations,
      projects,
      documents,
      acknowledgements,
      meetingRequests,
      rooms,
      slots,
      projectGrants,
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
    ];
    for (const email of emails) expect(email).toMatch(/@[a-z0-9.-]+\.example$/);
    expect(new Set(users.map((u) => u.email)).size).toBe(users.length);
    const ips = [...acknowledgements, ...auditEvents]
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

  it("only gives country memberships to COUNTRY users, and every COUNTRY user has one", () => {
    for (const m of memberships) {
      expect(userById.get(m.userId)?.role).toBe(UserRole.COUNTRY);
      expect(countries.some((c) => c.id === m.countryId)).toBe(true);
    }
    for (const u of users.filter((u) => u.role === UserRole.COUNTRY)) {
      expect(memberships.filter((m) => m.userId === u.id)).toHaveLength(1);
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

  it("gives investors the whole pipeline by default and shows each pipeline option once", () => {
    const scopeOf = (id: string) => userById.get(id)?.pipelineScope;
    expect(scopeOf("seed-user-investor-1")).toBe(PipelineScope.ALL);
    expect(scopeOf("seed-user-country-a-focal")).toBe(PipelineScope.NONE);
    // One country user who also sees the pipeline, one investor limited to some countries.
    expect(scopeOf("seed-user-country-c-focal")).toBe(PipelineScope.ALL);
    expect(scopeOf("seed-user-investor-4")).toBe(PipelineScope.SELECTED);
    for (const p of pipelineCountries) {
      expect(scopeOf(p.userId)).toBe(PipelineScope.SELECTED);
      expect(countries.some((c) => c.id === p.countryId)).toBe(true);
    }
    for (const inv of invitations) {
      expect(inv.pipelineScope).toBe(
        inv.role === UserRole.INVESTOR ? PipelineScope.ALL : PipelineScope.NONE,
      );
    }
  });

  it("has invitations that reference real inviters and store only a token hash", () => {
    for (const inv of invitations) {
      expect(userById.has(inv.invitedById)).toBe(true);
      expect(inv.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      if (inv.role === UserRole.COUNTRY) expect(inv.countryId).not.toBeNull();
    }
  });
});

describe("seed data: projects, documents and acknowledgements", () => {
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
    expect(new Set(projects.map((p) => p.tier)).size).toBe(2);
  });

  it("keeps publishedAt consistent with status and sizes in order", () => {
    for (const p of projects) {
      expect(countries.some((c) => c.id === p.countryId)).toBe(true);
      if (p.status === ProjectStatus.DRAFT) expect(p.publishedAt).toBeNull();
      else expect(p.publishedAt).toBeInstanceOf(Date);
      expect(p.sizeMinUsd).toBeLessThanOrEqual(p.sizeMaxUsd);
    }
  });

  it("never publishes a project without a stored acknowledgement on one of its teasers", () => {
    for (const p of projects.filter((p) => p.status !== ProjectStatus.DRAFT)) {
      const acks = acknowledgements.filter((a) => a.projectId === p.id);
      expect(acks.length, p.id).toBeGreaterThan(0);
      for (const a of acks) {
        const doc = documentById.get(a.documentId);
        expect(doc?.projectId).toBe(p.id);
        expect(doc?.kind).toBe("TEASER");
      }
      // The first publication was preceded by an acknowledgement.
      expect(
        acks.some((a) => a.acceptedAt <= p.publishedAt!),
        p.id,
      ).toBe(true);
    }
  });

  it("records acknowledgements by the country focal point, or on behalf with evidence", () => {
    for (const a of acknowledgements) {
      const u = userById.get(a.userId);
      if (a.onBehalfOfCountry) {
        expect(u?.role).toBe(UserRole.SUMMIT_ADMIN);
        expect(a.evidenceNote).toBeTruthy();
      } else {
        const countryId = projectById.get(a.projectId)?.countryId;
        expect(
          memberships.some(
            (m) =>
              m.userId === a.userId &&
              m.countryId === countryId &&
              m.role === MembershipRole.FOCAL_POINT,
          ),
        ).toBe(true);
        expect(a.evidenceNote).toBeNull();
      }
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

describe("seed data: meeting requests, slots and grants", () => {
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

  it("records who decided, and only Summit admins decide on behalf", () => {
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
      if (r.decidedOnBehalf) {
        expect(decider?.role).toBe(UserRole.SUMMIT_ADMIN);
      } else {
        const countryId = projectById.get(r.projectId)?.countryId;
        expect(
          memberships.some(
            (m) =>
              m.userId === r.decidedById &&
              m.countryId === countryId &&
              m.role === MembershipRole.FOCAL_POINT,
          ),
        ).toBe(true);
      }
    }
  });

  it("has two rooms with 30-minute slots on 8 Dec (full day) and 9 Dec (morning) only", () => {
    expect(rooms).toHaveLength(2);
    for (const s of slots) {
      expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(
        SLOT_MINUTES * 60_000,
      );
      const inDay8 =
        s.startsAt >= gst("2026-12-08T09:00") &&
        s.endsAt <= gst("2026-12-08T17:00");
      const inDay9 =
        s.startsAt >= gst("2026-12-09T09:00") &&
        s.endsAt <= gst("2026-12-09T12:30");
      expect(inDay8 || inDay9, s.id).toBe(true);
    }
    for (const room of rooms) {
      const starts = slots
        .filter((s) => s.roomId === room.id)
        .map((s) => s.startsAt.getTime());
      expect(new Set(starts).size).toBe(starts.length);
      expect(starts).toHaveLength(16 + 7);
    }
  });

  it("links booked and held slots only to accepted requests, one slot per request", () => {
    const linked = slots.filter((s) => s.meetingRequestId);
    expect(linked.some((s) => s.status === SlotStatus.BOOKED)).toBe(true);
    for (const s of slots) {
      if (s.status === SlotStatus.OPEN) expect(s.meetingRequestId).toBeNull();
      else
        expect(requestById.get(s.meetingRequestId!)?.status).toBe(
          MeetingRequestStatus.ACCEPTED,
        );
    }
    const requestIds = linked.map((s) => s.meetingRequestId);
    expect(new Set(requestIds).size).toBe(requestIds.length);
  });

  it("grants EXTRA material only to an investor with an accepted request, with an expiry", () => {
    expect(projectGrants.length).toBeGreaterThan(0);
    for (const g of projectGrants) {
      expect(g.scope).toBe("EXTRA");
      expect(g.expiresAt.getTime()).toBeGreaterThan(
        gst("2026-12-09T18:30").getTime(),
      );
      expect(g.revokedAt).toBeNull();
      expect(
        documents.some(
          (d) => d.projectId === g.projectId && d.kind === "EXTRA",
        ),
      ).toBe(true);
      expect(
        meetingRequests.some(
          (r) =>
            r.requesterId === g.userId &&
            r.projectId === g.projectId &&
            r.status === MeetingRequestStatus.ACCEPTED,
        ),
      ).toBe(true);
    }
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
