// @vitest-environment node
// M3 (PLAN v0.3 section 4): the pure data permissions, role by state. The Postgres side (exact visible sets,
// cross-country and cross-project isolation, audit) is in tests/integration/authz.test.ts.

import { describe, expect, it } from "vitest";
import {
  CountryStatus,
  DocumentKind,
  MeetingRequestStatus,
  MembershipRole,
  ProjectStatus,
  ScanStatus,
  SlotStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { type AccountStage, STAGE_PATH } from "./account-gate";
import {
  canDownloadDocument,
  canOpenDocumentFile,
  canUploadDocument,
  canViewDocument,
  documentWhere,
  type DocumentRef,
  NO_DOCUMENT,
} from "./documents";
import {
  auditEventWhere,
  canExport,
  canViewAuditLog,
  countryWhere,
  NO_COUNTRY,
  NO_USER,
  userWhere,
} from "./people";
import {
  canCreateProject,
  canDeleteProject,
  canEditProject,
  canEditProjectFacts,
  canPublishProject,
  canViewProject,
  canWithdrawProject,
  NO_PROJECT,
  pipelineProjectWhere,
  projectWhere,
  seesAsPipeline,
} from "./projects";
import {
  canDecideMeetingRequest,
  canExportMeetingRequests,
  canListOwnMeetingRequests,
  canRequestMeeting,
  canViewMeetingRequest,
  canViewRequestInbox,
  canWithdrawMeetingRequest,
  type MeetingRequestRef,
  meetingRequestWhere,
  NO_REQUEST,
  requestInboxWhere,
} from "./requests";
import {
  canBlockSlot,
  canBookSlot,
  canCancelMeetingRequest,
  canManageMeetingSchedule,
  canUnblockSlot,
  type SlotRef,
  slotView,
} from "./slots";
import {
  actsOnBehalf,
  hasPipeline,
  inPipeline,
  type ProjectRef,
  type Viewer,
  viewerFrom,
} from "./viewer";
import {
  canUseWorkspace,
  workspaceCountryWhere,
  workspacePermissions,
  workspaceProjectWhere,
} from "./workspace";

const { PUBLISHED, DRAFT, WITHDRAWN } = ProjectStatus;
const { FOCAL_POINT, MEMBER } = MembershipRole;

function viewer(
  id: string,
  role: UserRole,
  countries: string[] = [],
  membershipRole: MembershipRole = FOCAL_POINT,
): Viewer {
  return {
    id,
    role,
    memberships: countries.map((countryId) => ({
      countryId,
      role: membershipRole,
    })),
  };
}

const platformAdmin = viewer("pa", UserRole.PLATFORM_ADMIN);
const summitAdmin = viewer("sa", UserRole.SUMMIT_ADMIN);
const focalA = viewer("fa", UserRole.COUNTRY, ["a"]);
const memberA = viewer("ma", UserRole.COUNTRY, ["a"], MEMBER);
const focalB = viewer("fb", UserRole.COUNTRY, ["b"]);
const coordA = viewer("ca", UserRole.WBG_COORDINATOR, ["a"]);
const coordNone = viewer("c0", UserRole.WBG_COORDINATOR);
const investor = viewer("i", UserRole.INVESTOR);
const investor2 = viewer("i2", UserRole.INVESTOR);
/** Memberships only count for country and coordinator roles: a stray row must not widen anything. */
const investorWithStrayMembership = viewer("is", UserRole.INVESTOR, ["a"]);
const countryWithoutMembership = viewer("cn", UserRole.COUNTRY);

const admins = [platformAdmin, summitAdmin];
const everyone = [
  platformAdmin,
  summitAdmin,
  focalA,
  memberA,
  focalB,
  coordA,
  coordNone,
  investor,
  investor2,
  investorWithStrayMembership,
  countryWithoutMembership,
];

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
const allProjects = [aPub, aDraft, aWithdrawn, bPub, bDraft, xPubInactive];

describe("viewerFrom", () => {
  const user = { ...focalA, email: "x@y.example", name: "X" };

  it("builds a viewer with only id, role and memberships for an active account", () => {
    expect(viewerFrom({ stage: "active", user })).toEqual(focalA);
  });

  it("gives no viewer at any other stage of the account gate (investor acknowledgement included)", () => {
    const stages = (Object.keys(STAGE_PATH) as AccountStage[]).filter(
      (s) => s !== "active",
    );
    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      expect(viewerFrom({ stage, user }), stage).toBeNull();
    }
    expect(viewerFrom(null)).toBeNull();
    expect(viewerFrom(undefined)).toBeNull();
  });
});

describe("where builders deny by default", () => {
  it("match nothing for a missing viewer", () => {
    expect(projectWhere(null)).toEqual(NO_PROJECT);
    expect(pipelineProjectWhere(null)).toEqual(NO_PROJECT);
    expect(documentWhere(null)).toEqual(NO_DOCUMENT);
    expect(meetingRequestWhere(null)).toEqual(NO_REQUEST);
    expect(userWhere(null)).toEqual(NO_USER);
    expect(countryWhere(null)).toEqual(NO_COUNTRY);
    expect(workspaceProjectWhere(null)).toEqual(NO_PROJECT);
    expect(workspaceCountryWhere(null)).toEqual(NO_COUNTRY);
    expect(auditEventWhere(null)).not.toEqual({});
  });

  it("match nothing for a country user without a country", () => {
    expect(projectWhere(countryWithoutMembership)).toEqual(NO_PROJECT);
    expect(documentWhere(countryWithoutMembership)).toEqual(NO_DOCUMENT);
    expect(countryWhere(countryWithoutMembership)).toEqual(NO_COUNTRY);
    expect(meetingRequestWhere(countryWithoutMembership)).toEqual({
      requesterId: "cn",
    });
  });

  it("are unrestricted only for admins", () => {
    for (const v of everyone) {
      const admin = admins.includes(v);
      expect(JSON.stringify(projectWhere(v)) === "{}", v.id).toBe(admin);
      expect(JSON.stringify(documentWhere(v)) === "{}", v.id).toBe(admin);
      expect(JSON.stringify(meetingRequestWhere(v)) === "{}", v.id).toBe(admin);
      expect(JSON.stringify(userWhere(v)) === "{}", v.id).toBe(admin);
      expect(JSON.stringify(auditEventWhere(v)) === "{}", v.id).toBe(admin);
    }
  });

  it("give pipeline roles exactly the published projects of active countries, nothing narrower", () => {
    const pipeline = {
      status: PUBLISHED,
      country: { status: CountryStatus.ACTIVE },
    };
    for (const v of [investor, investor2, coordA, coordNone]) {
      expect(projectWhere(v), v.id).toEqual(pipeline);
    }
    // A stray membership on an investor changes nothing.
    expect(projectWhere(investorWithStrayMembership)).toEqual(pipeline);
  });

  it("give country users their own countries in every status, plus the pipeline (M12)", () => {
    const pipeline = {
      status: PUBLISHED,
      country: { status: CountryStatus.ACTIVE },
    };
    expect(projectWhere(focalA)).toEqual({
      OR: [{ countryId: { in: ["a"] } }, pipeline],
    });
    expect(projectWhere(memberA)).toEqual(projectWhere(focalA));
    expect(projectWhere(focalB)).toEqual({
      OR: [{ countryId: { in: ["b"] } }, pipeline],
    });
    // The workspace ("My projects") stays own countries only.
    expect(workspaceProjectWhere(focalA)).toEqual({ countryId: { in: ["a"] } });
  });
});

describe("projects", () => {
  /** Expected visibility per viewer, in the order of allProjects. */
  const matrix: [Viewer, boolean[]][] = [
    [platformAdmin, [true, true, true, true, true, true]],
    [summitAdmin, [true, true, true, true, true, true]],
    // M12: own country in full, plus other countries' published projects (never their drafts or inactive ones).
    [focalA, [true, true, true, true, false, false]],
    [memberA, [true, true, true, true, false, false]],
    [focalB, [true, false, false, true, true, false]],
    [coordA, [true, false, false, true, false, false]],
    [coordNone, [true, false, false, true, false, false]],
    [investor, [true, false, false, true, false, false]],
    [investorWithStrayMembership, [true, false, false, true, false, false]],
    [countryWithoutMembership, [false, false, false, false, false, false]],
  ];

  it("matches the visibility matrix for every role", () => {
    for (const [v, expected] of matrix) {
      expect(
        allProjects.map((p) => canViewProject(v, p)),
        v.id,
      ).toEqual(expected);
    }
  });

  it("denies everything to a missing viewer", () => {
    for (const p of allProjects) expect(canViewProject(null, p)).toBe(false);
  });

  it("puts only published projects of active countries in the pipeline, for pipeline roles", () => {
    expect(hasPipeline(investor)).toBe(true);
    expect(hasPipeline(coordA)).toBe(true);
    // M12: country users with a country have the pipeline; one without a country has nothing.
    expect(hasPipeline(focalA)).toBe(true);
    expect(hasPipeline(memberA)).toBe(true);
    for (const v of [summitAdmin, countryWithoutMembership, null]) {
      expect(hasPipeline(v)).toBe(false);
    }
    expect(inPipeline(investor, aPub)).toBe(true);
    for (const v of [investor, focalA, focalB]) {
      for (const p of [aDraft, aWithdrawn, bDraft, xPubInactive]) {
        expect(inPipeline(v, p), v.id).toBe(false);
      }
    }
    // Country users see other countries' published projects, never their drafts.
    expect(inPipeline(focalA, bPub)).toBe(true);
    expect(canViewProject(focalA, bPub)).toBe(true);
    expect(canViewProject(focalA, bDraft)).toBe(false);
    expect(canViewProject(focalB, aWithdrawn)).toBe(false);
  });

  it("marks pipeline-only access for investors, coordinators and other countries, not for owners or admins", () => {
    expect(seesAsPipeline(investor, aPub)).toBe(true);
    expect(seesAsPipeline(coordA, aPub)).toBe(true);
    expect(seesAsPipeline(focalB, aPub)).toBe(true);
    expect(seesAsPipeline(focalA, aPub)).toBe(false);
    expect(seesAsPipeline(summitAdmin, aPub)).toBe(false);
  });

  it("never lets a country user request a meeting, even on another country's published project (M12)", () => {
    for (const v of [focalA, memberA, focalB, coordA, summitAdmin]) {
      for (const p of allProjects) {
        expect(canRequestMeeting(v, p), v.id).toBe(false);
      }
    }
    expect(canRequestMeeting(investor, bPub)).toBe(true);
  });

  it("lets the uploader edit key facts of their own unpublished project, and admins any project (23 Nov)", () => {
    for (const v of everyone) {
      const admin = admins.includes(v);
      for (const uploader of [false, true]) {
        const ownA = (v === focalA || v === memberA) && uploader;
        for (const p of [aDraft, aWithdrawn]) {
          expect(canEditProjectFacts(v, p, uploader), v.id).toBe(admin || ownA);
        }
        expect(canEditProjectFacts(v, aPub, uploader), v.id).toBe(admin);
        // Another country's project: never, even when flagged as uploader.
        expect(canEditProjectFacts(v, bDraft, uploader), v.id).toBe(
          admin || (v === focalB && uploader),
        );
      }
    }
    for (const v of [coordA, investorWithStrayMembership, null]) {
      expect(canEditProjectFacts(v, aDraft, true)).toBe(false);
    }
  });

  it("lets only admins create, edit, publish and withdraw (v0.3: countries only see)", () => {
    for (const v of everyone) {
      const admin = admins.includes(v);
      expect(canCreateProject(v), v.id).toBe(admin);
      expect(canEditProject(v), v.id).toBe(admin);
      for (const p of [aDraft, aWithdrawn]) {
        expect(canPublishProject(v, p), v.id).toBe(admin);
        expect(canWithdrawProject(v, p), v.id).toBe(false);
      }
      expect(canPublishProject(v, aPub), v.id).toBe(false);
      expect(canWithdrawProject(v, aPub), v.id).toBe(admin);
    }
    expect(canCreateProject(null)).toBe(false);
    expect(canPublishProject(null, aDraft)).toBe(false);
  });

  it("lets admins delete any project and country users only their own unpublished ones (23 Nov)", () => {
    for (const v of everyone) {
      const admin = admins.includes(v);
      const ownA = v === focalA || v === memberA;
      for (const p of [aDraft, aWithdrawn]) {
        expect(canDeleteProject(v, p), v.id).toBe(admin || ownA);
      }
      // Published: the Summit team only.
      expect(canDeleteProject(v, aPub), v.id).toBe(admin);
      // Another country's projects: never for a country user, whatever the status.
      for (const p of [bDraft, bPub]) {
        expect(canDeleteProject(v, p), v.id).toBe(
          admin || (v === focalB && p === bDraft),
        );
      }
    }
    // Coordinators, investors (even with a stray membership) and a country user without membership: never.
    for (const v of [
      coordA,
      investorWithStrayMembership,
      countryWithoutMembership,
    ]) {
      expect(canDeleteProject(v, aDraft), v.id).toBe(false);
    }
    expect(canDeleteProject(null, aDraft)).toBe(false);
  });

  it("calls an admin's action for a country 'on behalf'", () => {
    expect(actsOnBehalf(summitAdmin, "a")).toBe(true);
    expect(actsOnBehalf(focalA, "a")).toBe(false);
    expect(actsOnBehalf(investor, "a")).toBe(false);
  });
});

describe("country workspace", () => {
  it("is open to admins and country users only", () => {
    for (const v of everyone) {
      const expected =
        admins.includes(v) || v === focalA || v === memberA || v === focalB;
      expect(canUseWorkspace(v), v.id).toBe(expected);
    }
    expect(canUseWorkspace(null)).toBe(false);
  });

  it("lists own countries' projects for country users and nothing for pipeline roles", () => {
    expect(workspaceProjectWhere(focalA)).toEqual({ countryId: { in: ["a"] } });
    expect(workspaceProjectWhere(coordA)).toEqual(NO_PROJECT);
    expect(workspaceProjectWhere(investorWithStrayMembership)).toEqual(
      NO_PROJECT,
    );
    expect(workspaceCountryWhere(coordA)).toEqual(NO_COUNTRY);
  });

  it("is read only for country users, apart from deleting their own drafts", () => {
    expect(workspacePermissions(focalA, aDraft)).toEqual({
      edit: false,
      uploadTeaser: false,
      publish: false,
      withdraw: false,
      delete: true,
      onBehalf: false,
    });
    expect(workspacePermissions(focalA, aPub).delete).toBe(false);
    expect(workspacePermissions(summitAdmin, aDraft)).toEqual({
      edit: true,
      uploadTeaser: true,
      publish: true,
      withdraw: false,
      delete: true,
      onBehalf: true,
    });
  });
});

describe("documents", () => {
  function doc(
    p: ProjectRef,
    overrides: Partial<Omit<DocumentRef, "project">> = {},
  ): DocumentRef {
    return {
      kind: DocumentKind.TEASER,
      filename: "Teaser.pdf",
      scanStatus: ScanStatus.CLEAN,
      supersededById: null,
      allowDownload: true,
      project: p,
      ...overrides,
    };
  }

  const current = doc(aPub);
  const old = doc(aPub, { supersededById: "newer" });
  const pending = doc(aPub, { scanStatus: ScanStatus.PENDING });
  const infected = doc(aPub, { scanStatus: ScanStatus.INFECTED });
  const noDownload = doc(aPub, { allowDownload: false });
  const draftTeaser = doc(aDraft);
  const otherCountry = doc(bPub);
  const inactiveCountry = doc(xPubInactive);
  const notPdf = doc(aPub, { filename: "Deck.pptx" });
  const notPdfOther = doc(bPub, { filename: "Scan.JPG" });

  it("shows pipeline roles the current clean teaser of a pipeline project only", () => {
    for (const v of [investor, coordA]) {
      expect(canViewDocument(v, current), v.id).toBe(true);
      expect(canViewDocument(v, otherCountry), v.id).toBe(true);
      for (const d of [old, pending, infected, draftTeaser, inactiveCountry]) {
        expect(canViewDocument(v, d), v.id).toBe(false);
      }
    }
  });

  it("never shows pipeline roles a teaser that is not a PDF (M11), in any country", () => {
    for (const v of [investor, coordA]) {
      expect(canViewDocument(v, notPdf), v.id).toBe(false);
      expect(canViewDocument(v, notPdfOther), v.id).toBe(false);
      expect(canDownloadDocument(v, notPdf), v.id).toBe(false);
    }
    // The owning country and admins still see it, so it can be converted; another country never does.
    expect(canDownloadDocument(focalA, notPdf)).toBe(true);
    expect(canDownloadDocument(summitAdmin, notPdf)).toBe(true);
    expect(canViewDocument(focalB, notPdf)).toBe(false);
  });

  it("shows country users every document of their own countries, and of others only the published current PDF (M12)", () => {
    for (const d of [current, old, pending, infected, draftTeaser, notPdf]) {
      expect(canViewDocument(focalA, d)).toBe(true);
      expect(canViewDocument(memberA, d)).toBe(true);
    }
    for (const d of [old, pending, infected, draftTeaser, notPdf]) {
      expect(canViewDocument(focalB, d)).toBe(false);
    }
    expect(canViewDocument(focalB, current)).toBe(true);
    expect(canViewDocument(focalA, otherCountry)).toBe(true);
    expect(canViewDocument(focalA, inactiveCountry)).toBe(false);
    // The admin's download switch applies to other countries, never to the owner.
    expect(canDownloadDocument(focalB, noDownload)).toBe(false);
    expect(canOpenDocumentFile(focalB, noDownload)).toBe(true);
    expect(canDownloadDocument(focalA, noDownload)).toBe(true);
  });

  it("never opens a file that is not scanned clean, for anyone", () => {
    for (const v of everyone) {
      expect(canOpenDocumentFile(v, pending), v.id).toBe(false);
      expect(canOpenDocumentFile(v, infected), v.id).toBe(false);
    }
  });

  it("allows downloads by default and respects an admin's 'view only' switch for pipeline roles", () => {
    expect(canDownloadDocument(investor, current)).toBe(true);
    expect(canDownloadDocument(coordA, current)).toBe(true);
    expect(canDownloadDocument(investor, noDownload)).toBe(false);
    expect(canOpenDocumentFile(investor, noDownload)).toBe(true);
    expect(canDownloadDocument(focalA, noDownload)).toBe(true);
    expect(canDownloadDocument(summitAdmin, noDownload)).toBe(true);
  });

  it("lets only admins download a pending upload, and nobody an infected one", () => {
    for (const v of everyone) {
      expect(canDownloadDocument(v, pending), v.id).toBe(admins.includes(v));
      expect(canDownloadDocument(v, infected), v.id).toBe(false);
    }
  });

  it("denies a missing viewer", () => {
    expect(canViewDocument(null, current)).toBe(false);
    expect(canDownloadDocument(null, current)).toBe(false);
  });

  it("lets only admins upload teasers in the portal", () => {
    for (const v of everyone) {
      expect(canUploadDocument(v), v.id).toBe(admins.includes(v));
    }
  });

  it("scopes document lists like projects, and pipeline lists to current clean teasers", () => {
    const pipeline = {
      kind: DocumentKind.TEASER,
      supersededById: null,
      scanStatus: ScanStatus.CLEAN,
      filename: { endsWith: ".pdf", mode: "insensitive" },
      project: { status: PUBLISHED, country: { status: CountryStatus.ACTIVE } },
    };
    // M12: own countries' documents in full, plus the pipeline documents.
    expect(documentWhere(focalA)).toEqual({
      OR: [{ project: { countryId: { in: ["a"] } } }, pipeline],
    });
    expect(documentWhere(investor)).toEqual(pipeline);
    expect(documentWhere(investorWithStrayMembership)).toEqual(
      documentWhere(investor),
    );
  });
});

describe("meeting requests", () => {
  const request = (
    requesterId: string,
    countryId: string,
    status: MeetingRequestStatus = MeetingRequestStatus.PENDING,
  ): MeetingRequestRef => ({ requesterId, status, project: { countryId } });

  const iOnA = request("i", "a");
  const i2OnA = request("i2", "a");
  const iOnB = request("i", "b");

  it("shows a request to its requester, its country, that country's coordinators and admins only", () => {
    const visible = (v: Viewer, r: MeetingRequestRef) =>
      canViewMeetingRequest(v, r);
    expect(visible(investor, iOnA)).toBe(true);
    expect(visible(investor, i2OnA)).toBe(false); // other investors' requests
    expect(visible(focalA, iOnA)).toBe(true);
    expect(visible(memberA, iOnA)).toBe(true);
    expect(visible(focalA, iOnB)).toBe(false); // other countries' requests
    expect(visible(focalB, iOnA)).toBe(false);
    expect(visible(coordA, iOnA)).toBe(true);
    expect(visible(coordA, iOnB)).toBe(false); // not their country
    expect(visible(coordNone, iOnA)).toBe(false);
    expect(visible(investorWithStrayMembership, iOnA)).toBe(false);
    expect(visible(summitAdmin, iOnB)).toBe(true);
    expect(canViewMeetingRequest(null, iOnA)).toBe(false);
  });

  it("scopes request lists the same way", () => {
    expect(meetingRequestWhere(investor)).toEqual({ requesterId: "i" });
    expect(meetingRequestWhere(focalA)).toEqual({
      OR: [{ requesterId: "fa" }, { project: { countryId: { in: ["a"] } } }],
    });
    expect(meetingRequestWhere(coordA)).toEqual({
      OR: [{ requesterId: "ca" }, { project: { countryId: { in: ["a"] } } }],
    });
    expect(meetingRequestWhere(coordNone)).toEqual({ requesterId: "c0" });
    expect(meetingRequestWhere(investorWithStrayMembership)).toEqual({
      requesterId: "is",
    });
  });

  it("gives the country-side inbox to admins, country users and coordinators of their own countries only", () => {
    expect(requestInboxWhere(null)).toEqual(NO_REQUEST);
    for (const a of admins) expect(requestInboxWhere(a)).toEqual({});
    expect(requestInboxWhere(focalA)).toEqual({
      project: { countryId: { in: ["a"] } },
    });
    expect(requestInboxWhere(coordA)).toEqual({
      project: { countryId: { in: ["a"] } },
    });
    for (const v of [
      investor,
      investorWithStrayMembership,
      coordNone,
      countryWithoutMembership,
    ]) {
      expect(requestInboxWhere(v), v.id).toEqual(NO_REQUEST);
    }
    for (const v of everyone) {
      const inbox =
        admins.includes(v) || [focalA, memberA, focalB, coordA].includes(v);
      expect(canViewRequestInbox(v), v.id).toBe(inbox);
      expect(canExportMeetingRequests(v), v.id).toBe(inbox);
      expect(canListOwnMeetingRequests(v), v.id).toBe(
        v.role === UserRole.INVESTOR,
      );
    }
    expect(canViewRequestInbox(null)).toBe(false);
    expect(canExportMeetingRequests(null)).toBe(false);
    expect(canListOwnMeetingRequests(null)).toBe(false);
  });

  it("lets only investors request meetings, on pipeline projects", () => {
    expect(canRequestMeeting(investor, aPub)).toBe(true);
    expect(canRequestMeeting(investor, aDraft)).toBe(false);
    expect(canRequestMeeting(investor, xPubInactive)).toBe(false);
    for (const v of [coordA, focalB, summitAdmin, null]) {
      expect(canRequestMeeting(v, aPub)).toBe(false);
    }
  });

  it("lets any user of the country, or an admin, decide pending requests; coordinators only read", () => {
    expect(canDecideMeetingRequest(focalA, iOnA)).toBe(true);
    expect(canDecideMeetingRequest(memberA, iOnA)).toBe(true);
    expect(canDecideMeetingRequest(summitAdmin, iOnA)).toBe(true);
    expect(canDecideMeetingRequest(focalB, iOnA)).toBe(false);
    expect(canDecideMeetingRequest(coordA, iOnA)).toBe(false);
    expect(canDecideMeetingRequest(investor, iOnA)).toBe(false);
    expect(canDecideMeetingRequest(null, iOnA)).toBe(false);
    for (const status of [
      MeetingRequestStatus.ACCEPTED,
      MeetingRequestStatus.DECLINED,
      MeetingRequestStatus.WITHDRAWN,
    ]) {
      expect(canDecideMeetingRequest(focalA, request("i", "a", status))).toBe(
        false,
      );
    }
  });

  it("lets only the requester withdraw, while pending or accepted", () => {
    expect(canWithdrawMeetingRequest(investor, iOnA)).toBe(true);
    expect(
      canWithdrawMeetingRequest(
        investor,
        request("i", "a", MeetingRequestStatus.ACCEPTED),
      ),
    ).toBe(true);
    expect(
      canWithdrawMeetingRequest(
        investor,
        request("i", "a", MeetingRequestStatus.DECLINED),
      ),
    ).toBe(false);
    expect(canWithdrawMeetingRequest(investor2, iOnA)).toBe(false);
    expect(canWithdrawMeetingRequest(focalA, iOnA)).toBe(false);
    expect(canWithdrawMeetingRequest(null, iOnA)).toBe(false);
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

  it("shows a booking in full to admins, the requester, the owning country and its coordinators", () => {
    const slot = booking(SlotStatus.HELD, "i", "a");
    for (const v of [summitAdmin, investor, focalA, memberA, coordA]) {
      expect(slotView(v, slot), v.id).toEqual({
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
      for (const v of [focalB, investor2, coordNone]) {
        expect(slotView(v, slot), v.id).toEqual(hidden);
      }
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

  it("lets a user of the owning country or an admin book a slot for an accepted request", () => {
    const accepted = {
      status: MeetingRequestStatus.ACCEPTED,
      project: { countryId: "a" },
    };
    expect(canBookSlot(focalA, accepted)).toBe(true);
    expect(canBookSlot(memberA, accepted)).toBe(true);
    expect(canBookSlot(summitAdmin, accepted)).toBe(true);
    expect(canBookSlot(focalB, accepted)).toBe(false);
    expect(canBookSlot(coordA, accepted)).toBe(false);
    expect(canBookSlot(investor, accepted)).toBe(false);
    expect(
      canBookSlot(focalA, {
        ...accepted,
        status: MeetingRequestStatus.PENDING,
      }),
    ).toBe(false);
  });

  it("gives the master calendar and its controls to admins only (23 Nov)", () => {
    for (const v of everyone) {
      const admin = admins.includes(v);
      expect(canManageMeetingSchedule(v), v.id).toBe(admin);
      expect(
        canBlockSlot(v, { status: SlotStatus.OPEN, meetingRequestId: null }),
        v.id,
      ).toBe(admin);
      expect(canUnblockSlot(v, { status: SlotStatus.BLOCKED }), v.id).toBe(
        admin,
      );
      for (const status of [
        MeetingRequestStatus.PENDING,
        MeetingRequestStatus.ACCEPTED,
      ]) {
        expect(canCancelMeetingRequest(v, { status }), v.id).toBe(admin);
      }
    }
    expect(canManageMeetingSchedule(null)).toBe(false);
    expect(canCancelMeetingRequest(null, { status: "PENDING" })).toBe(false);
  });

  it("blocks only free slots, unblocks only blocked ones and cancels only open requests", () => {
    expect(
      canBlockSlot(summitAdmin, {
        status: SlotStatus.HELD,
        meetingRequestId: "r",
      }),
    ).toBe(false);
    expect(
      canBlockSlot(summitAdmin, {
        status: SlotStatus.BOOKED,
        meetingRequestId: "r",
      }),
    ).toBe(false);
    expect(
      canBlockSlot(summitAdmin, {
        status: SlotStatus.BLOCKED,
        meetingRequestId: null,
      }),
    ).toBe(false);
    expect(canUnblockSlot(summitAdmin, { status: SlotStatus.OPEN })).toBe(
      false,
    );
    for (const status of [
      MeetingRequestStatus.DECLINED,
      MeetingRequestStatus.WITHDRAWN,
      MeetingRequestStatus.CANCELLED,
    ]) {
      expect(canCancelMeetingRequest(platformAdmin, { status })).toBe(false);
    }
  });

  it("never shows a blocked slot's reason or state as free to non-admins", () => {
    const blocked: SlotRef = {
      id: "s",
      roomId: "r",
      startsAt: new Date("2026-12-08T05:00:00Z"),
      endsAt: new Date("2026-12-08T05:30:00Z"),
      status: SlotStatus.BLOCKED,
      meetingRequestId: null,
      meetingRequest: null,
    };
    for (const v of [focalA, coordA, investor]) {
      expect(slotView(v, blocked)?.status, v.id).toBe(SlotStatus.BOOKED);
    }
  });
});

describe("people and countries", () => {
  it("lets country users list their own country's users only, and others only themselves", () => {
    expect(userWhere(focalA)).toEqual({
      OR: [
        { id: "fa" },
        {
          role: UserRole.COUNTRY,
          memberships: { some: { countryId: { in: ["a"] } } },
        },
      ],
    });
    expect(userWhere(coordA)).toEqual({ id: "ca" });
    expect(userWhere(investorWithStrayMembership)).toEqual({ id: "is" });
  });

  it("names own countries for country users, and active countries for pipeline roles", () => {
    // M12: country users have the pipeline too, so every active country can be named.
    expect(countryWhere(focalA)).toEqual({
      OR: [{ id: { in: ["a"] } }, { status: CountryStatus.ACTIVE }],
    });
    expect(countryWhere(investor)).toEqual({ status: CountryStatus.ACTIVE });
    expect(countryWhere(coordA)).toEqual({
      OR: [{ id: { in: ["a"] } }, { status: CountryStatus.ACTIVE }],
    });
  });
});

describe("audit log and exports", () => {
  it("are for admins only", () => {
    for (const v of everyone) {
      expect(canViewAuditLog(v), v.id).toBe(admins.includes(v));
      expect(canExport(v), v.id).toBe(admins.includes(v));
    }
    expect(canViewAuditLog(null)).toBe(false);
    expect(canExport(null)).toBe(false);
  });
});
