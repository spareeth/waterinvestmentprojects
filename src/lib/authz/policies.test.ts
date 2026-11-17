// @vitest-environment node
// M4: the pure data permissions (PLAN section 3). Role by state matrices; the Postgres side is in
// tests/integration/authz.test.ts.

import { describe, expect, it } from "vitest";
import {
  CountryStatus,
  DocumentKind,
  GrantScope,
  MeetingRequestStatus,
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  ScanStatus,
  SlotStatus,
  UserRole,
} from "@/generated/prisma/enums";
import {
  canDownloadDocument,
  canOpenDocumentFile,
  canUploadDocument,
  canViewDocument,
  documentWhere,
  type DocumentRef,
  NO_DOCUMENT,
} from "./documents";
import { canGrantExtra, canRevokeGrant, isGrantActive } from "./grants";
import { auditEventWhere, canExport, canViewAuditLog } from "./people";
import {
  canCreateProject,
  canEditProject,
  canPublishProject,
  canViewProject,
  canWithdrawProject,
  NO_PROJECT,
  projectWhere,
  seesAsPipeline,
} from "./projects";
import {
  canDecideMeetingRequest,
  canRequestMeeting,
  canViewMeetingRequest,
  canWithdrawMeetingRequest,
  meetingRequestWhere,
  NO_REQUEST,
} from "./requests";
import { canBookSlot, type SlotRef, slotView } from "./slots";
import {
  actsOnBehalf,
  inPipeline,
  type ProjectRef,
  type Viewer,
  viewerFrom,
} from "./viewer";

const { PUBLISHED, DRAFT, WITHDRAWN } = ProjectStatus;
const { FOCAL_POINT, MEMBER } = MembershipRole;

function viewer(
  id: string,
  role: UserRole,
  memberships: Viewer["memberships"] = [],
  pipelineScope: PipelineScope = PipelineScope.NONE,
  pipelineCountryIds: string[] = [],
): Viewer {
  return { id, role, memberships, pipelineScope, pipelineCountryIds };
}

const platformAdmin = viewer("pa", UserRole.PLATFORM_ADMIN);
const summitAdmin = viewer("sa", UserRole.SUMMIT_ADMIN);
const focalA = viewer("fa", UserRole.COUNTRY, [
  { countryId: "a", role: FOCAL_POINT },
]);
const memberA = viewer("ma", UserRole.COUNTRY, [
  { countryId: "a", role: MEMBER },
]);
const focalBWithPipeline = viewer(
  "fb",
  UserRole.COUNTRY,
  [{ countryId: "b", role: FOCAL_POINT }],
  PipelineScope.ALL,
);
const investor = viewer("i", UserRole.INVESTOR, [], PipelineScope.ALL);
const investorOnlyB = viewer(
  "ib",
  UserRole.INVESTOR,
  [],
  PipelineScope.SELECTED,
  ["b"],
);
const investorNone = viewer("in", UserRole.INVESTOR);
// Memberships only count for COUNTRY users.
const investorWithStrayMembership = viewer(
  "is",
  UserRole.INVESTOR,
  [{ countryId: "a", role: FOCAL_POINT }],
  PipelineScope.ALL,
);
const countryWithoutMembership = viewer("cn", UserRole.COUNTRY);

const admins = [platformAdmin, summitAdmin];

function project(
  countryId: string,
  status: ProjectStatus,
  countryStatus: CountryStatus = CountryStatus.ACTIVE,
): ProjectRef {
  return { countryId, status, country: { status: countryStatus } };
}

const aPub = project("a", PUBLISHED);
const aDraft = project("a", DRAFT);
const aWithdrawn = project("a", WITHDRAWN);
const bPub = project("b", PUBLISHED);
const bDraft = project("b", DRAFT);
const xPubInactive = project("x", PUBLISHED, CountryStatus.INACTIVE);

describe("viewerFrom", () => {
  const user = { ...investor, email: "x@y.example", name: "X" };
  it("only builds a viewer for an active account", () => {
    expect(viewerFrom({ stage: "active", user })).toEqual(investor);
    for (const stage of ["pending", "enrol-2fa", "terms"] as const) {
      expect(viewerFrom({ stage, user }), stage).toBeNull();
    }
    expect(viewerFrom(null)).toBeNull();
  });
});

describe("where builders deny by default", () => {
  it("match nothing for a missing viewer", () => {
    expect(projectWhere(null)).toEqual(NO_PROJECT);
    expect(documentWhere(null, new Date())).toEqual(NO_DOCUMENT);
    expect(meetingRequestWhere(null)).toEqual(NO_REQUEST);
    expect(auditEventWhere(null)).not.toEqual({});
  });

  it("match nothing for users with neither a workspace nor a pipeline", () => {
    expect(projectWhere(investorNone)).toEqual(NO_PROJECT);
    expect(projectWhere(countryWithoutMembership)).toEqual(NO_PROJECT);
    expect(
      projectWhere(viewer("s0", UserRole.INVESTOR, [], PipelineScope.SELECTED)),
    ).toEqual(NO_PROJECT);
  });

  it("are unrestricted only for admins", () => {
    for (const admin of admins) {
      expect(projectWhere(admin)).toEqual({});
      expect(documentWhere(admin, new Date())).toEqual({});
      expect(meetingRequestWhere(admin)).toEqual({});
    }
    expect(projectWhere(focalA)).not.toEqual({});
    expect(projectWhere(investor)).not.toEqual({});
  });
});

describe("projects", () => {
  const all = [aPub, aDraft, aWithdrawn, bPub, bDraft, xPubInactive];
  const visible = (v: Viewer | null) => all.filter((p) => canViewProject(v, p));

  it("shows admins everything", () => {
    for (const admin of admins) expect(visible(admin)).toEqual(all);
  });

  it("shows a country its own projects in every status, and no other country's", () => {
    expect(visible(focalA)).toEqual([aPub, aDraft, aWithdrawn]);
    expect(visible(memberA)).toEqual([aPub, aDraft, aWithdrawn]);
    expect(visible(countryWithoutMembership)).toEqual([]);
  });

  it("adds other countries' published projects for a country user with a pipeline", () => {
    expect(visible(focalBWithPipeline)).toEqual([aPub, bPub, bDraft]);
    expect(seesAsPipeline(focalBWithPipeline, aPub)).toBe(true);
    expect(seesAsPipeline(focalBWithPipeline, bPub)).toBe(false);
  });

  it("shows investors only PUBLISHED projects of active countries in their scope", () => {
    expect(visible(investor)).toEqual([aPub, bPub]);
    expect(visible(investorOnlyB)).toEqual([bPub]);
    expect(visible(investorNone)).toEqual([]);
    expect(visible(investorWithStrayMembership)).toEqual([aPub, bPub]);
    expect(visible(null)).toEqual([]);
  });

  it("lets admins and any member of the country create projects", () => {
    expect(canCreateProject(summitAdmin, "a")).toBe(true);
    expect(canCreateProject(memberA, "a")).toBe(true);
    expect(canCreateProject(memberA, "b")).toBe(false);
    expect(canCreateProject(investorWithStrayMembership, "a")).toBe(false);
    expect(canCreateProject(null, "a")).toBe(false);
  });

  it("lets members edit drafts only, and focal points and admins any own project", () => {
    expect(canEditProject(memberA, aDraft)).toBe(true);
    expect(canEditProject(memberA, aPub)).toBe(false);
    expect(canEditProject(memberA, aWithdrawn)).toBe(false);
    for (const p of [aDraft, aPub, aWithdrawn]) {
      expect(canEditProject(focalA, p)).toBe(true);
      expect(canEditProject(summitAdmin, p)).toBe(true);
    }
    expect(canEditProject(focalA, bDraft)).toBe(false);
    expect(canEditProject(focalBWithPipeline, aPub)).toBe(false);
    expect(canEditProject(investor, aPub)).toBe(false);
  });

  it("lets only focal points and admins publish and withdraw", () => {
    expect(canPublishProject(focalA, aDraft)).toBe(true);
    expect(canPublishProject(focalA, aWithdrawn)).toBe(true);
    expect(canPublishProject(focalA, aPub)).toBe(false);
    expect(canPublishProject(memberA, aDraft)).toBe(false);
    expect(canPublishProject(focalA, bDraft)).toBe(false);
    expect(canPublishProject(platformAdmin, bDraft)).toBe(true);
    expect(canWithdrawProject(focalA, aPub)).toBe(true);
    expect(canWithdrawProject(focalA, aDraft)).toBe(false);
    expect(canWithdrawProject(memberA, aPub)).toBe(false);
    expect(canWithdrawProject(investor, aPub)).toBe(false);
  });

  it("marks admin actions for a country as on behalf", () => {
    expect(actsOnBehalf(summitAdmin, "a")).toBe(true);
    expect(actsOnBehalf(focalA, "a")).toBe(false);
  });
});

describe("documents", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const later = new Date("2026-12-31T00:00:00Z");
  const earlier = new Date("2026-11-01T00:00:00Z");

  function doc(
    proj: ProjectRef,
    kind: DocumentKind,
    extra: Partial<Omit<DocumentRef, "project">> = {},
  ): DocumentRef {
    return {
      projectId: `p-${proj.countryId}-${proj.status}`,
      kind,
      scanStatus: ScanStatus.CLEAN,
      supersededById: null,
      allowDownload: false,
      project: proj,
      ...extra,
    };
  }
  const teaser = doc(aPub, DocumentKind.TEASER);
  const extra = doc(aPub, DocumentKind.EXTRA);
  const dataroom = doc(aPub, DocumentKind.DATAROOM);
  const oldTeaser = doc(aPub, DocumentKind.TEASER, { supersededById: "v2" });
  const pendingTeaser = doc(aPub, DocumentKind.TEASER, {
    scanStatus: ScanStatus.PENDING,
  });
  const infected = doc(aPub, DocumentKind.TEASER, {
    scanStatus: ScanStatus.INFECTED,
  });
  const draftTeaser = doc(aDraft, DocumentKind.TEASER);
  const noGrants = { grants: [], now };
  const grant = (userId: string, expiresAt: Date, revokedAt: Date | null) => ({
    userId,
    projectId: extra.projectId,
    scope: GrantScope.EXTRA,
    expiresAt,
    revokedAt,
  });

  it("shows pipeline viewers only current, clean teasers of pipeline projects", () => {
    expect(canViewDocument(investor, teaser, noGrants)).toBe(true);
    for (const d of [
      extra,
      dataroom,
      oldTeaser,
      pendingTeaser,
      infected,
      draftTeaser,
    ]) {
      expect(canViewDocument(investor, d, noGrants)).toBe(false);
      expect(canViewDocument(focalBWithPipeline, d, noGrants)).toBe(false);
    }
    expect(canViewDocument(investorOnlyB, teaser, noGrants)).toBe(false);
    expect(canViewDocument(null, teaser, noGrants)).toBe(false);
  });

  it("needs an active, unrevoked grant for this user and project for EXTRA material", () => {
    const can = (grants: ReturnType<typeof grant>[]) =>
      canViewDocument(investor, extra, { grants, now });
    expect(can([grant("i", later, null)])).toBe(true);
    expect(can([grant("i", earlier, null)])).toBe(false);
    expect(can([grant("i", later, earlier)])).toBe(false);
    expect(can([grant("someone-else", later, null)])).toBe(false);
    expect(
      can([{ ...grant("i", later, null), projectId: "another-project" }]),
    ).toBe(false);
    expect(
      isGrantActive(grant("i", now, null), "i", extra.projectId, now),
    ).toBe(false);
  });

  it("shows the owning country and admins every document, but opens files only when clean", () => {
    for (const v of [focalA, memberA, summitAdmin]) {
      for (const d of [teaser, extra, dataroom, oldTeaser, draftTeaser]) {
        expect(canViewDocument(v, d, noGrants)).toBe(true);
        expect(canOpenDocumentFile(v, d, noGrants)).toBe(true);
      }
      expect(canViewDocument(v, pendingTeaser, noGrants)).toBe(true);
      expect(canOpenDocumentFile(v, pendingTeaser, noGrants)).toBe(false);
      expect(canOpenDocumentFile(v, infected, noGrants)).toBe(false);
    }
  });

  it("allows downloads to pipeline viewers only where the country switched it on", () => {
    expect(canDownloadDocument(investor, teaser, noGrants)).toBe(false);
    expect(
      canDownloadDocument(
        investor,
        { ...teaser, allowDownload: true },
        noGrants,
      ),
    ).toBe(true);
    expect(canDownloadDocument(memberA, teaser, noGrants)).toBe(true);
    expect(canDownloadDocument(platformAdmin, teaser, noGrants)).toBe(true);
    expect(
      canDownloadDocument(
        investor,
        { ...draftTeaser, allowDownload: true },
        noGrants,
      ),
    ).toBe(false);
  });

  it("lets uploads follow project editing; DATAROOM is admin only for now", () => {
    expect(canUploadDocument(memberA, aDraft, DocumentKind.TEASER)).toBe(true);
    expect(canUploadDocument(memberA, aPub, DocumentKind.TEASER)).toBe(false);
    expect(canUploadDocument(focalA, aPub, DocumentKind.EXTRA)).toBe(true);
    expect(canUploadDocument(focalA, aPub, DocumentKind.DATAROOM)).toBe(false);
    expect(canUploadDocument(summitAdmin, aPub, DocumentKind.DATAROOM)).toBe(
      true,
    );
    expect(canUploadDocument(investor, aPub, DocumentKind.TEASER)).toBe(false);
  });
});

describe("grants", () => {
  it("lets the focal point or an admin share extra material with an investor who sees the project", () => {
    expect(canGrantExtra(focalA, aPub, investor)).toBe(true);
    expect(canGrantExtra(summitAdmin, aPub, investor)).toBe(true);
    expect(canGrantExtra(memberA, aPub, investor)).toBe(false);
    expect(canGrantExtra(focalA, aDraft, investor)).toBe(false);
    expect(canGrantExtra(focalA, aPub, investorOnlyB)).toBe(false);
    expect(canGrantExtra(focalA, aPub, focalBWithPipeline)).toBe(false);
    expect(canGrantExtra(focalBWithPipeline, aPub, investor)).toBe(false);
  });

  it("lets the same people revoke a grant once", () => {
    const g = { revokedAt: null, project: { countryId: "a" } };
    expect(canRevokeGrant(focalA, g)).toBe(true);
    expect(canRevokeGrant(memberA, g)).toBe(false);
    expect(canRevokeGrant(investor, g)).toBe(false);
    expect(canRevokeGrant(focalA, { ...g, revokedAt: new Date() })).toBe(false);
  });
});

describe("meeting requests", () => {
  const request = (
    requesterId: string,
    status: MeetingRequestStatus,
    countryId = "a",
  ) => ({ requesterId, status, project: { countryId } });
  const pending = request("i", MeetingRequestStatus.PENDING);

  it("are visible to the requester, the owning country and admins only", () => {
    expect(canViewMeetingRequest(investor, pending)).toBe(true);
    expect(canViewMeetingRequest(focalA, pending)).toBe(true);
    expect(canViewMeetingRequest(memberA, pending)).toBe(true);
    expect(canViewMeetingRequest(summitAdmin, pending)).toBe(true);
    expect(canViewMeetingRequest(focalBWithPipeline, pending)).toBe(false);
    expect(canViewMeetingRequest(investorOnlyB, pending)).toBe(false);
    expect(canViewMeetingRequest(null, pending)).toBe(false);
  });

  it("can be made by investors on projects in their pipeline only", () => {
    expect(canRequestMeeting(investor, aPub)).toBe(true);
    expect(canRequestMeeting(investor, aDraft)).toBe(false);
    expect(canRequestMeeting(investor, xPubInactive)).toBe(false);
    expect(canRequestMeeting(investorOnlyB, aPub)).toBe(false);
    expect(canRequestMeeting(focalBWithPipeline, aPub)).toBe(false);
    expect(canRequestMeeting(summitAdmin, aPub)).toBe(false);
  });

  it("are decided by the focal point or an admin, while pending", () => {
    expect(canDecideMeetingRequest(focalA, pending)).toBe(true);
    expect(canDecideMeetingRequest(summitAdmin, pending)).toBe(true);
    expect(canDecideMeetingRequest(memberA, pending)).toBe(false);
    expect(canDecideMeetingRequest(focalBWithPipeline, pending)).toBe(false);
    expect(canDecideMeetingRequest(investor, pending)).toBe(false);
    expect(
      canDecideMeetingRequest(
        focalA,
        request("i", MeetingRequestStatus.ACCEPTED),
      ),
    ).toBe(false);
  });

  it("can be withdrawn by the requester while pending or accepted", () => {
    expect(canWithdrawMeetingRequest(investor, pending)).toBe(true);
    expect(
      canWithdrawMeetingRequest(
        investor,
        request("i", MeetingRequestStatus.ACCEPTED),
      ),
    ).toBe(true);
    expect(
      canWithdrawMeetingRequest(
        investor,
        request("i", MeetingRequestStatus.DECLINED),
      ),
    ).toBe(false);
    expect(canWithdrawMeetingRequest(focalA, pending)).toBe(false);
    expect(canWithdrawMeetingRequest(investorOnlyB, pending)).toBe(false);
  });
});

describe("slots", () => {
  const base = {
    id: "s",
    roomId: "r",
    startsAt: new Date("2026-12-08T05:00:00Z"),
    endsAt: new Date("2026-12-08T05:30:00Z"),
  };
  const booking = (
    status: SlotStatus,
    requesterId: string,
    countryId: string,
  ): SlotRef => ({
    ...base,
    status,
    meetingRequestId: "req",
    meetingRequest: { requesterId, project: { countryId } },
  });
  const openSlot: SlotRef = {
    ...base,
    status: SlotStatus.OPEN,
    meetingRequestId: null,
    meetingRequest: null,
  };
  const hidden = {
    ...base,
    status: SlotStatus.BOOKED,
    meetingRequestId: null,
    mine: false,
  };

  it("shows the booking in full to admins, the requester and the owning country", () => {
    const slot = booking(SlotStatus.HELD, "i", "a");
    for (const v of [summitAdmin, investor, focalA, memberA]) {
      expect(slotView(v, slot)).toEqual({
        ...base,
        status: SlotStatus.HELD,
        meetingRequestId: "req",
        mine: true,
      });
    }
  });

  it("shows everyone else only 'Booked', held or booked alike", () => {
    for (const status of [SlotStatus.HELD, SlotStatus.BOOKED]) {
      const slot = booking(status, "i", "a");
      expect(slotView(focalBWithPipeline, slot)).toEqual(hidden);
      expect(slotView(investorOnlyB, slot)).toEqual(hidden);
    }
  });

  it("shows open slots as open and nothing to a missing viewer", () => {
    expect(slotView(investor, openSlot)).toEqual({
      ...base,
      status: SlotStatus.OPEN,
      meetingRequestId: null,
      mine: false,
    });
    expect(slotView(null, openSlot)).toBeNull();
  });

  it("lets the focal point or an admin book a slot for an accepted request", () => {
    const accepted = {
      status: MeetingRequestStatus.ACCEPTED,
      project: { countryId: "a" },
    };
    expect(canBookSlot(focalA, accepted)).toBe(true);
    expect(canBookSlot(summitAdmin, accepted)).toBe(true);
    expect(canBookSlot(memberA, accepted)).toBe(false);
    expect(canBookSlot(investor, accepted)).toBe(false);
    expect(
      canBookSlot(focalA, {
        ...accepted,
        status: MeetingRequestStatus.PENDING,
      }),
    ).toBe(false);
  });
});

describe("pipeline scope", () => {
  it("never puts drafts, withdrawn projects or inactive countries in a pipeline", () => {
    for (const v of [investor, focalBWithPipeline]) {
      expect(inPipeline(v, aDraft)).toBe(false);
      expect(inPipeline(v, aWithdrawn)).toBe(false);
      expect(inPipeline(v, xPubInactive)).toBe(false);
    }
  });

  it("limits SELECTED to the listed countries", () => {
    expect(inPipeline(investorOnlyB, bPub)).toBe(true);
    expect(inPipeline(investorOnlyB, aPub)).toBe(false);
  });
});

describe("audit log and exports", () => {
  it("are for admins only", () => {
    for (const admin of admins) {
      expect(canViewAuditLog(admin)).toBe(true);
      expect(canExport(admin)).toBe(true);
    }
    for (const v of [focalA, memberA, investor, null]) {
      expect(canViewAuditLog(v)).toBe(false);
      expect(canExport(v)).toBe(false);
    }
  });
});
