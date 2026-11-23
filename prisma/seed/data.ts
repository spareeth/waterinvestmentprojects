// Fictional seed data for local and staging. No real countries, people, organisations or projects.
// Pure data: no database access here, so unit tests can check its shape without PostgreSQL.
// Every id starts with "seed-" and every timestamp is fixed, so re-running the seed changes nothing.

import { createHash } from "node:crypto";
import {
  CountryContactRole,
  CountryStatus,
  DocumentKind,
  MeetingRequestStatus,
  MembershipRole,
  OrganisationType,
  ProjectStatus,
  ProjectType,
  ScanStatus,
  SlotStatus,
  UserRole,
  UserStatus,
} from "../../src/generated/prisma/enums";
import { appConfig } from "../../src/lib/config";
import {
  MEETING_ROOMS,
  MEETING_SCHEDULE,
} from "../../src/lib/meetings/schedule";
import { buildPlaceholderPdf } from "./pdf";

/** Summit venue time zone is Gulf Standard Time (UTC+4, no daylight saving). */
export function gst(localDateTime: string): Date {
  return new Date(`${localDateTime}:00+04:00`);
}

/**
 * Demo password for every seed user on a LOCAL machine only (documented in the README, so not a secret).
 * Staging must set SEED_DEMO_PASSWORD instead; the seed refuses to use this value in a production build.
 */
export const LOCAL_DEMO_PASSWORD = "Local-demo-only-2026";
export const SLOT_MINUTES = 30;

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

export const countries = [
  {
    id: "seed-country-a",
    name: "Country A",
    iso3: "XAA",
    status: CountryStatus.ACTIVE,
  },
  {
    id: "seed-country-b",
    name: "Country B",
    iso3: "XAB",
    status: CountryStatus.ACTIVE,
  },
  {
    id: "seed-country-c",
    name: "Country C",
    iso3: "XAC",
    status: CountryStatus.ACTIVE,
  },
  {
    id: "seed-country-d",
    name: "Country D",
    iso3: "XAD",
    status: CountryStatus.ACTIVE,
  },
  {
    id: "seed-country-e",
    name: "Country E",
    iso3: "XAE",
    status: CountryStatus.ACTIVE,
  },
];

// ---------------------------------------------------------------------------
// Users (all emails use the reserved .example domain)
// ---------------------------------------------------------------------------

const termsAccepted = gst("2026-11-10T09:00");

/**
 * M2: this active investor has not accepted the investor acknowledgement yet, so the demo can show that step
 * (every other active investor accepted the current version from config).
 */
export const INVESTOR_WITHOUT_ACK = "seed-user-investor-3";

/** M13 (PLAN v0.4 0b.16): fictional organisation types, so the demo shows demand by type. */
const SEED_ORGANISATION_TYPE: Partial<Record<string, OrganisationType>> = {
  "investor-1": OrganisationType.INFRASTRUCTURE_OPERATOR,
  "investor-2": OrganisationType.INVESTOR_FUND,
  "investor-3": OrganisationType.COMMERCIAL_BANK,
  "investor-4": OrganisationType.INFRASTRUCTURE_OPERATOR,
  "investor-pending": OrganisationType.INVESTOR_FUND,
  "investor-deactivated": OrganisationType.INFRASTRUCTURE_OPERATOR,
};

function user(
  id: string,
  email: string,
  name: string,
  organisation: string,
  jobTitle: string,
  role: UserRole,
  status: UserStatus = UserStatus.ACTIVE,
) {
  return {
    id: `seed-user-${id}`,
    email,
    name,
    organisation,
    organisationType: SEED_ORGANISATION_TYPE[id] ?? null,
    jobTitle,
    role,
    status,
    // No second step by default (AUTH_SECOND_STEP=none, PLAN 0a.3); with totp, demo users enrol their own
    // authenticator app at first sign-in. Re-running the seed resets enrolment.
    mfaEnabled: false,
    emailVerified: true,
    termsAcceptedAt: status === UserStatus.ACTIVE ? termsAccepted : null,
    // Demo users sign in with the documented demo password and are not asked to change it.
    mustChangePassword: false,
    ...investorAck(`seed-user-${id}`, role, status),
  };
}

function investorAck(userId: string, role: UserRole, status: UserStatus) {
  const accepted =
    role === UserRole.INVESTOR &&
    status === UserStatus.ACTIVE &&
    userId !== INVESTOR_WITHOUT_ACK;
  return {
    investorAckTextVersion: accepted
      ? appConfig.investorAcknowledgement.version
      : null,
    investorAckAcceptedAt: accepted ? termsAccepted : null,
  };
}

export const users = [
  user(
    "platform-admin",
    "platform.admin@demo.example",
    "Pat Platform",
    "Terra (demo)",
    "Platform administrator",
    UserRole.PLATFORM_ADMIN,
  ),
  user(
    "summit-admin",
    "summit.admin@demo.example",
    "Sam Summit",
    "Summit team (demo)",
    "Summit coordinator",
    UserRole.SUMMIT_ADMIN,
  ),
  user(
    "country-a-focal",
    "focal@country-a.example",
    "Avery Example",
    "Ministry of Water, Country A",
    "Focal point",
    UserRole.COUNTRY,
  ),
  user(
    "country-a-member",
    "member@country-a.example",
    "Alex Sample",
    "Ministry of Water, Country A",
    "PPP analyst",
    UserRole.COUNTRY,
  ),
  user(
    "country-b-focal",
    "focal@country-b.example",
    "Blake Example",
    "Water Authority, Country B",
    "Focal point",
    UserRole.COUNTRY,
  ),
  user(
    "country-b-member",
    "member@country-b.example",
    "Bailey Sample",
    "Water Authority, Country B",
    "Project engineer",
    UserRole.COUNTRY,
  ),
  user(
    "country-c-focal",
    "focal@country-c.example",
    "Casey Example",
    "PPP Unit, Country C",
    "Focal point",
    UserRole.COUNTRY,
  ),
  // M2: WBG coordinator for Countries A to C (country contacts below), read-only on their requests from M5.
  user(
    "wbg-coordinator",
    "coordinator.one@wbg-demo.example",
    "Jordan Coordinator",
    "World Bank Group (demo)",
    "Country coordinator",
    UserRole.WBG_COORDINATOR,
  ),
  user(
    "investor-1",
    "investor@operator-one.example",
    "Drew Investor",
    "Operator One",
    "Head of Business Development",
    UserRole.INVESTOR,
  ),
  user(
    "investor-2",
    "investor@fund-two.example",
    "Eden Investor",
    "Infrastructure Fund Two",
    "Investment Director",
    UserRole.INVESTOR,
  ),
  user(
    "investor-3",
    "investor@bank-three.example",
    "Frankie Investor",
    "Regional Bank Three",
    "Project Finance",
    UserRole.INVESTOR,
  ),
  user(
    "investor-4",
    "investor@developer-four.example",
    "Gray Investor",
    "Developer Four",
    "Managing Director",
    UserRole.INVESTOR,
  ),
  // Self-registered, waiting for Summit admin approval: must see nothing.
  user(
    "investor-pending",
    "applicant@fund-five.example",
    "Harper Applicant",
    "Fund Five",
    "Analyst",
    UserRole.INVESTOR,
    UserStatus.PENDING_APPROVAL,
  ),
  // Former participant whose access was removed.
  user(
    "investor-deactivated",
    "former@operator-six.example",
    "Indy Former",
    "Operator Six",
    "Associate",
    UserRole.INVESTOR,
    UserStatus.DEACTIVATED,
  ),
];

export const memberships = [
  {
    userId: "seed-user-country-a-focal",
    countryId: "seed-country-a",
    role: MembershipRole.FOCAL_POINT,
  },
  {
    userId: "seed-user-country-a-member",
    countryId: "seed-country-a",
    role: MembershipRole.MEMBER,
  },
  {
    userId: "seed-user-country-b-focal",
    countryId: "seed-country-b",
    role: MembershipRole.FOCAL_POINT,
  },
  {
    userId: "seed-user-country-b-member",
    countryId: "seed-country-b",
    role: MembershipRole.MEMBER,
  },
  {
    userId: "seed-user-country-c-focal",
    countryId: "seed-country-c",
    role: MembershipRole.FOCAL_POINT,
  },
  // M2: a WBG coordinator's countries are membership rows too (the membership role means nothing for them).
  ...["a", "b", "c"].map((c) => ({
    userId: "seed-user-wbg-coordinator",
    countryId: `seed-country-${c}`,
    role: MembershipRole.MEMBER,
  })),
];

export const invitations = [
  {
    id: "seed-invitation-investor-1",
    email: "investor@operator-one.example",
    role: UserRole.INVESTOR,
    countryId: null,
    membershipRole: null,
    tokenHash: sha256Hex("seed-invitation-investor-1"),
    expiresAt: gst("2026-11-20T23:59"),
    acceptedAt: gst("2026-11-10T08:45"),
    invitedById: "seed-user-summit-admin",
  },
  {
    id: "seed-invitation-investor-7",
    email: "invitee@fund-seven.example",
    role: UserRole.INVESTOR,
    countryId: null,
    membershipRole: null,
    tokenHash: sha256Hex("seed-invitation-investor-7"),
    expiresAt: gst("2026-12-07T23:59"),
    acceptedAt: null,
    invitedById: "seed-user-summit-admin",
  },
  {
    id: "seed-invitation-country-c-member",
    email: "member@country-c.example",
    role: UserRole.COUNTRY,
    countryId: "seed-country-c",
    membershipRole: MembershipRole.MEMBER,
    tokenHash: sha256Hex("seed-invitation-country-c-member"),
    expiresAt: gst("2026-12-07T23:59"),
    acceptedAt: null,
    invitedById: "seed-user-country-c-focal",
  },
];

// ---------------------------------------------------------------------------
// Upload links and submissions (PLAN v0.3 F0). Every teaser below comes with a Submission recording the
// uploader's acknowledgement. The links are history only: revoked, and their token hashes are random values
// made by seed.ts on first insert, so no seed link can ever be opened. Admins create fresh links in the portal.
// ---------------------------------------------------------------------------

/** The upload acknowledgement versions stored on the seed submissions (from src/lib/config.ts). */
export const UPLOAD_ACK_TEXT_VERSION = appConfig.uploadAcknowledgement.version;
export const UPLOAD_ACK_ON_BEHALF_TEXT_VERSION =
  appConfig.uploadAcknowledgementOnBehalf.version;

function uploadLink(id: string, countryId: string | null, createdAt: Date) {
  return {
    id: `seed-link-${id}`,
    countryId,
    expiresAt: gst("2026-11-30T23:59"),
    revokedAt: gst("2026-11-17T18:00"),
    createdById: "seed-user-summit-admin",
    createdAt,
  };
}

export const uploadLinks = [
  uploadLink("a", "seed-country-a", gst("2026-11-09T09:00")),
  uploadLink("b", "seed-country-b", gst("2026-11-09T09:05")),
  uploadLink("c", "seed-country-c", gst("2026-11-09T09:10")),
  uploadLink("e", "seed-country-e", gst("2026-11-09T09:15")),
  // Country D used the generic link (the uploader picked the country).
  uploadLink("generic", null, gst("2026-11-09T09:20")),
];

function submission(
  id: string,
  countryId: string,
  uploadLinkId: string | null,
  uploaderName: string,
  uploaderEmail: string,
  at: Date,
  ackTextVersion: string = UPLOAD_ACK_TEXT_VERSION,
) {
  return {
    id: `seed-submission-${id}`,
    countryId,
    uploadLinkId,
    uploaderName,
    uploaderEmail,
    ackTextVersion,
    ackAcceptedAt: at,
    // Documentation-range IP addresses only.
    ip: "203.0.113.10",
    createdAt: at,
  };
}

export const submissions = [
  // Through the upload links: the uploader typed name and email.
  submission(
    "a",
    "seed-country-a",
    "seed-link-a",
    "Avery Example",
    "focal@country-a.example",
    gst("2026-11-11T14:00"),
  ),
  submission(
    "b",
    "seed-country-b",
    "seed-link-b",
    "Blake Example",
    "focal@country-b.example",
    gst("2026-11-10T12:00"),
  ),
  submission(
    "c",
    "seed-country-c",
    "seed-link-c",
    "Casey Example",
    "focal@country-c.example",
    gst("2026-11-13T10:00"),
  ),
  submission(
    "d",
    "seed-country-d",
    "seed-link-generic",
    "Dana Sample",
    "water.ppp@country-d.example",
    gst("2026-11-14T14:00"),
  ),
  submission(
    "e",
    "seed-country-e",
    "seed-link-e",
    "Emery Example",
    "projects@country-e.example",
    gst("2026-11-14T14:30"),
  ),
  // In the portal workspace (no link): the signed-in user is the uploader.
  submission(
    "a3-workspace",
    "seed-country-a",
    null,
    "Alex Sample",
    "member@country-a.example",
    gst("2026-11-15T16:00"),
  ),
  submission(
    "b1-v2-workspace",
    "seed-country-b",
    null,
    "Blake Example",
    "focal@country-b.example",
    gst("2026-11-14T09:00"),
  ),
];

// ---------------------------------------------------------------------------
// Country contacts (PLAN v0.3): each link uploader is the country's request-inbox contact (FOCAL_POINT), and
// each country has a fictional WBG coordinator, copied on its request notifications.
// ---------------------------------------------------------------------------

function contact(
  id: string,
  countryId: string,
  name: string,
  email: string,
  role: CountryContactRole,
  userId: string | null = null,
) {
  return { id: `seed-contact-${id}`, countryId, name, email, role, userId };
}

const { FOCAL_POINT, WBG_COORDINATOR } = CountryContactRole;

export const countryContacts = [
  contact(
    "a-focal",
    "seed-country-a",
    "Avery Example",
    "focal@country-a.example",
    FOCAL_POINT,
    "seed-user-country-a-focal",
  ),
  contact(
    "b-focal",
    "seed-country-b",
    "Blake Example",
    "focal@country-b.example",
    FOCAL_POINT,
    "seed-user-country-b-focal",
  ),
  contact(
    "c-focal",
    "seed-country-c",
    "Casey Example",
    "focal@country-c.example",
    FOCAL_POINT,
    "seed-user-country-c-focal",
  ),
  contact(
    "d-focal",
    "seed-country-d",
    "Dana Sample",
    "water.ppp@country-d.example",
    FOCAL_POINT,
  ),
  contact(
    "e-focal",
    "seed-country-e",
    "Emery Example",
    "projects@country-e.example",
    FOCAL_POINT,
  ),
  // Two fictional coordinators share the five countries.
  ...["a", "b", "c"].map((c) =>
    contact(
      `${c}-wbg`,
      `seed-country-${c}`,
      "Jordan Coordinator",
      "coordinator.one@wbg-demo.example",
      WBG_COORDINATOR,
      "seed-user-wbg-coordinator",
    ),
  ),
  ...["d", "e"].map((c) =>
    contact(
      `${c}-wbg`,
      `seed-country-${c}`,
      "Riley Coordinator",
      "coordinator.two@wbg-demo.example",
      WBG_COORDINATOR,
    ),
  ),
];

// ---------------------------------------------------------------------------
// Projects (PLAN v0.3: no tiers; PPP model, size and development stage entered by the admin team).
// Coordinates are arbitrary map positions, not real project locations (kept for the later map, M10).
// ---------------------------------------------------------------------------

export const projects = [
  {
    id: "seed-project-a1",
    countryId: "seed-country-a",
    submissionId: "seed-submission-a",
    title: "Municipal water network efficiency",
    sector: "Non-revenue water (NRW)",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Performance-based contract (PBC)",
    sizeMinUsd: 60_000_000,
    sizeMaxUsd: 90_000_000,
    developmentStage: "Feasibility in progress",
    lat: 12.5,
    lon: 41.0,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-12T10:00"),
  },
  {
    id: "seed-project-a2",
    countryId: "seed-country-a",
    submissionId: "seed-submission-a",
    title: "Treated wastewater reuse for irrigation",
    sector: "Wastewater and reuse",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Concession",
    sizeMinUsd: 40_000_000,
    sizeMaxUsd: 55_000_000,
    developmentStage: "Conceptual",
    lat: 13.4,
    lon: 42.2,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-12T10:30"),
  },
  {
    // Added in the portal workspace, not through the link.
    id: "seed-project-a3",
    countryId: "seed-country-a",
    submissionId: null,
    title: "Rural water supply clusters",
    sector: "Water supply",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "DBO",
    sizeMinUsd: 25_000_000,
    sizeMaxUsd: 35_000_000,
    developmentStage: null,
    lat: 11.8,
    lon: 40.4,
    status: ProjectStatus.DRAFT,
    publishedAt: null,
  },
  {
    id: "seed-project-b1",
    countryId: "seed-country-b",
    submissionId: "seed-submission-b",
    title: "Wastewater treatment plants, PPP",
    sector: "Wastewater and reuse",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "DBFOM",
    sizeMinUsd: 180_000_000,
    sizeMaxUsd: 220_000_000,
    developmentStage: "Post-feasibility",
    lat: 24.1,
    lon: 52.8,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-11T09:00"),
  },
  {
    id: "seed-project-b2",
    countryId: "seed-country-b",
    submissionId: "seed-submission-b",
    title: "Seawater desalination and conveyance",
    sector: "Desalination",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "BOT",
    sizeMinUsd: 450_000_000,
    sizeMaxUsd: 600_000_000,
    developmentStage: "Transaction advisory",
    lat: 25.0,
    lon: 54.1,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-11T09:30"),
  },
  {
    // Added in the portal workspace; no teaser yet.
    id: "seed-project-b3",
    countryId: "seed-country-b",
    submissionId: null,
    title: "Sludge to energy facility",
    sector: "Wastewater and reuse",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "DBFOM",
    sizeMinUsd: 30_000_000,
    sizeMaxUsd: 45_000_000,
    developmentStage: null,
    lat: 24.6,
    lon: 53.3,
    status: ProjectStatus.DRAFT,
    publishedAt: null,
  },
  {
    id: "seed-project-c1",
    countryId: "seed-country-c",
    submissionId: "seed-submission-c",
    title: "Bulk water supply scheme",
    sector: "Water supply",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "DBFOMT",
    sizeMinUsd: 120_000_000,
    sizeMaxUsd: 150_000_000,
    developmentStage: "RFQ",
    lat: -1.5,
    lon: 36.2,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-13T11:00"),
  },
  {
    id: "seed-project-c2",
    countryId: "seed-country-c",
    submissionId: "seed-submission-c",
    title: "Irrigation modernisation, phase 1",
    sector: "Irrigation infrastructure",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Management contract and affermage",
    sizeMinUsd: 85_000_000,
    sizeMaxUsd: 110_000_000,
    developmentStage: "Conceptual",
    lat: -2.3,
    lon: 37.4,
    // Was published, then withdrawn by the country: investors must no longer see it.
    status: ProjectStatus.WITHDRAWN,
    publishedAt: gst("2026-11-13T11:30"),
  },
  {
    id: "seed-project-d1",
    countryId: "seed-country-d",
    submissionId: "seed-submission-d",
    title: "Utility non-revenue water programme",
    sector: "Non-revenue water (NRW)",
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Affermage",
    sizeMinUsd: 70_000_000,
    sizeMaxUsd: 95_000_000,
    developmentStage: "Feasibility in progress",
    lat: 6.4,
    lon: 3.6,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-14T15:00"),
  },
  {
    id: "seed-project-e1",
    countryId: "seed-country-e",
    submissionId: "seed-submission-e",
    title: "Regional reservoir and treatment works",
    sector: "Water supply",
    projectType: ProjectType.OTHER_PROPONENT,
    pppModel: "DBO",
    sizeMinUsd: 200_000_000,
    sizeMaxUsd: 260_000_000,
    developmentStage: "Conceptual",
    lat: 31.2,
    lon: 70.1,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-14T15:30"),
  },
];

// ---------------------------------------------------------------------------
// Documents (placeholder PDFs generated deterministically). Each points at the Submission whose
// acknowledgement covers it; uploadedById is empty for upload link files (the Submission names the uploader).
// ---------------------------------------------------------------------------

function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function formatSize(min: number, max: number): string {
  return `USD ${min / 1_000_000}-${max / 1_000_000}m`;
}

interface DocumentSpec {
  id: string;
  projectId: string;
  submissionId: string;
  kind: DocumentKind;
  filename: string;
  version: number;
  allowDownload: boolean;
  scanStatus: ScanStatus;
  uploadedById: string | null;
  uploadedAt: Date;
  supersededById: string | null;
}

const documentSpecs: DocumentSpec[] = [
  {
    id: "seed-doc-a1-teaser-v1",
    projectId: "seed-project-a1",
    submissionId: "seed-submission-a",
    kind: DocumentKind.TEASER,
    filename: "country-a-network-efficiency-teaser.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-11T14:00"),
    supersededById: null,
  },
  {
    // View only: shows that a teaser can still be switched to view only.
    id: "seed-doc-a2-teaser-v1",
    projectId: "seed-project-a2",
    submissionId: "seed-submission-a",
    kind: DocumentKind.TEASER,
    filename: "country-a-wastewater-reuse-teaser.pdf",
    version: 1,
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-11T14:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-a3-teaser-v1",
    projectId: "seed-project-a3",
    submissionId: "seed-submission-a3-workspace",
    kind: DocumentKind.TEASER,
    filename: "country-a-rural-supply-draft.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.PENDING,
    uploadedById: "seed-user-country-a-member",
    uploadedAt: gst("2026-11-15T16:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-b1-teaser-v1",
    projectId: "seed-project-b1",
    submissionId: "seed-submission-b",
    kind: DocumentKind.TEASER,
    filename: "country-b-wastewater-ppp-teaser-v1.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-10T12:00"),
    supersededById: "seed-doc-b1-teaser-v2",
  },
  {
    id: "seed-doc-b1-teaser-v2",
    projectId: "seed-project-b1",
    submissionId: "seed-submission-b1-v2-workspace",
    kind: DocumentKind.TEASER,
    filename: "country-b-wastewater-ppp-teaser-v2.pdf",
    version: 2,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-b-focal",
    uploadedAt: gst("2026-11-14T09:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-b2-teaser-v1",
    projectId: "seed-project-b2",
    submissionId: "seed-submission-b",
    kind: DocumentKind.TEASER,
    filename: "country-b-desalination-teaser.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-10T12:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-c1-teaser-v1",
    projectId: "seed-project-c1",
    submissionId: "seed-submission-c",
    kind: DocumentKind.TEASER,
    filename: "country-c-bulk-supply-teaser.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-13T10:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-c2-teaser-v1",
    projectId: "seed-project-c2",
    submissionId: "seed-submission-c",
    kind: DocumentKind.TEASER,
    filename: "country-c-irrigation-teaser.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-13T10:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-d1-teaser-v1",
    projectId: "seed-project-d1",
    submissionId: "seed-submission-d",
    kind: DocumentKind.TEASER,
    filename: "country-d-nrw-teaser.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-14T14:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-e1-teaser-v1",
    projectId: "seed-project-e1",
    submissionId: "seed-submission-e",
    kind: DocumentKind.TEASER,
    filename: "country-e-reservoir-teaser.pdf",
    version: 1,
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: null,
    uploadedAt: gst("2026-11-14T14:30"),
    supersededById: null,
  },
];

const dateOnly = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dubai",
});

function pdfFor(spec: DocumentSpec): Uint8Array {
  const project = projects.find((p) => p.id === spec.projectId);
  const country = countries.find((c) => c.id === project?.countryId);
  if (!project || !country)
    throw new Error(`Seed document ${spec.id} has no project or country`);
  const lines = [
    `Sector: ${project.sector}`,
    `PPP model: ${project.pppModel ?? "To be confirmed"}`,
    `Indicative size: ${formatSize(project.sizeMinUsd, project.sizeMaxUsd)}`,
    `Development stage: ${project.developmentStage ?? "To be confirmed"}`,
    "Fictional demo teaser. Not a real project.",
  ];
  return buildPlaceholderPdf({
    title: project.title,
    subtitle: `${country.name}. Project teaser, version ${spec.version}, ${dateOnly.format(spec.uploadedAt)}`,
    lines,
  });
}

/** Placeholder PDF bytes keyed by blobKey. */
export const documentFiles = new Map<string, Uint8Array>();

export const documents = documentSpecs.map((spec) => {
  const bytes = pdfFor(spec);
  const blobKey = `seed/projects/${spec.projectId}/${spec.id}.pdf`;
  documentFiles.set(blobKey, bytes);
  return {
    ...spec,
    blobKey,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
  };
});

// ---------------------------------------------------------------------------
// Publications (for the seed audit trail): who published each project that went to the pipeline.
// ---------------------------------------------------------------------------

const publishedBy: Record<string, string> = {
  "seed-country-a": "seed-user-country-a-focal",
  "seed-country-b": "seed-user-country-b-focal",
  "seed-country-c": "seed-user-country-c-focal",
  "seed-country-d": "seed-user-summit-admin",
  "seed-country-e": "seed-user-summit-admin",
};

const publications = projects.flatMap((p) =>
  p.publishedAt
    ? [
        {
          projectId: p.id,
          actorId: publishedBy[p.countryId],
          at: p.publishedAt,
          documentId:
            documents.find(
              (d) =>
                d.projectId === p.id &&
                d.kind === DocumentKind.TEASER &&
                d.supersededById === null,
            )?.id ?? null,
          onBehalf: publishedBy[p.countryId] === "seed-user-summit-admin",
        },
      ]
    : [],
);

// ---------------------------------------------------------------------------
// Meeting requests (only on PUBLISHED projects; requesters are investors)
// ---------------------------------------------------------------------------

/** M5: organisation and role as the investor typed them on the request, taken from their seed account. */
function requesterDetails(requesterId: string) {
  const u = users.find((x) => x.id === requesterId);
  if (!u) throw new Error(`Seed request by unknown user ${requesterId}`);
  return { organisation: u.organisation, role: u.jobTitle };
}

function request(
  id: string,
  projectId: string,
  requesterId: string,
  status: MeetingRequestStatus,
  createdAt: Date,
  note: string,
  decision?: { decidedById: string; decidedAt: Date },
) {
  return {
    id: `seed-request-${id}`,
    projectId,
    requesterId,
    ...requesterDetails(requesterId),
    note,
    status,
    decidedById: decision?.decidedById ?? null,
    decidedAt: decision?.decidedAt ?? null,
    createdAt,
  };
}

const { PENDING, ACCEPTED, DECLINED, WITHDRAWN, CANCELLED } =
  MeetingRequestStatus;

export const meetingRequests = [
  request(
    "01",
    "seed-project-b1",
    "seed-user-investor-1",
    PENDING,
    gst("2026-11-15T10:00"),
    "We would welcome a bilateral meeting on the PPP structure.",
  ),
  request(
    "02",
    "seed-project-b2",
    "seed-user-investor-2",
    ACCEPTED,
    gst("2026-11-15T11:00"),
    "Interested in the energy supply arrangements.",
    {
      decidedById: "seed-user-country-b-focal",
      decidedAt: gst("2026-11-16T09:00"),
    },
  ),
  request(
    "03",
    "seed-project-b1",
    "seed-user-investor-3",
    ACCEPTED,
    gst("2026-11-14T12:00"),
    "Keen to discuss the financing plan.",
    {
      decidedById: "seed-user-country-b-focal",
      decidedAt: gst("2026-11-15T09:00"),
    },
  ),
  request(
    "04",
    "seed-project-b2",
    "seed-user-investor-4",
    PENDING,
    gst("2026-11-14T16:00"),
    "Request for a meeting with the project team.",
  ),
  request(
    "05",
    "seed-project-a1",
    "seed-user-investor-2",
    PENDING,
    gst("2026-11-15T13:00"),
    "Could you share the baseline loss figures?",
  ),
  request(
    "06",
    "seed-project-c1",
    "seed-user-investor-1",
    DECLINED,
    gst("2026-11-14T09:00"),
    "Would like to explore participation as operator.",
    {
      decidedById: "seed-user-country-c-focal",
      decidedAt: gst("2026-11-15T15:00"),
    },
  ),
  request(
    "07",
    "seed-project-d1",
    "seed-user-investor-3",
    ACCEPTED,
    gst("2026-11-15T08:30"),
    "Interested in the lease model.",
    {
      decidedById: "seed-user-summit-admin",
      decidedAt: gst("2026-11-16T11:00"),
    },
  ),
  request(
    "08",
    "seed-project-a2",
    "seed-user-investor-4",
    WITHDRAWN,
    gst("2026-11-13T10:00"),
    "Please share the offtake study.",
  ),
  request(
    "09",
    "seed-project-e1",
    "seed-user-investor-1",
    ACCEPTED,
    gst("2026-11-15T14:00"),
    "Interested in operating the treatment works.",
    {
      decidedById: "seed-user-summit-admin",
      decidedAt: gst("2026-11-16T12:00"),
    },
  ),
  request(
    "10",
    "seed-project-c1",
    "seed-user-investor-2",
    DECLINED,
    gst("2026-11-14T17:00"),
    "Is a sovereign guarantee planned?",
    {
      decidedById: "seed-user-country-c-focal",
      decidedAt: gst("2026-11-15T15:30"),
    },
  ),
  request(
    "11",
    "seed-project-e1",
    "seed-user-investor-4",
    WITHDRAWN,
    gst("2026-11-15T09:00"),
    "Could you share the hydrology summary?",
  ),
  // 23 Nov: cancelled by the Summit team from the admin calendar (the slot was freed).
  request(
    "12",
    "seed-project-d1",
    "seed-user-investor-2",
    CANCELLED,
    gst("2026-11-15T15:00"),
    "Could we meet the utility's finance director?",
  ),
];

// ---------------------------------------------------------------------------
// Rooms and 30-minute slots from the meeting schedule (src/lib/meetings/schedule.ts): Room 1 - Al Jimi (22 people) and
// Room 2 - Shawka (10 people), 8, 9 and 10 Dec 09:00 to 19:00 (GST)
// ---------------------------------------------------------------------------

export const rooms = MEETING_ROOMS.map((room, i) => ({
  id: `seed-room-${i + 1}`,
  name: room.name,
  capacity: room.capacity,
}));

export const SLOT_WINDOWS = MEETING_SCHEDULE.days;

/**
 * Bookings and holds keyed by "<roomId>@<local date>T<time>": a pending request holds its time (HELD), an
 * accepted one has it booked (BOOKED). Request 04 (pending) chose no time.
 */
const slotAssignments: Record<
  string,
  { status: SlotStatus; meetingRequestId: string }
> = {
  "seed-room-1@2026-12-08T10:30": {
    status: SlotStatus.BOOKED,
    meetingRequestId: "seed-request-03",
  },
  "seed-room-1@2026-12-08T10:00": {
    status: SlotStatus.BOOKED,
    meetingRequestId: "seed-request-02",
  },
  "seed-room-1@2026-12-08T11:00": {
    status: SlotStatus.HELD,
    meetingRequestId: "seed-request-01",
  },
  "seed-room-2@2026-12-08T11:00": {
    status: SlotStatus.HELD,
    meetingRequestId: "seed-request-05",
  },
  "seed-room-2@2026-12-09T09:30": {
    status: SlotStatus.BOOKED,
    meetingRequestId: "seed-request-07",
  },
};

/** 23 Nov: times the Summit team blocked on the admin calendar, in every room (demo data). */
const SEED_BLOCK = {
  date: "2026-12-09",
  from: "15:30",
  to: "17:00",
  reason: "Summit plenary",
} as const;

function isSeedBlocked(date: string, minutes: number): boolean {
  return (
    date === SEED_BLOCK.date &&
    minutes >= minutesOf(SEED_BLOCK.from) &&
    minutes < minutesOf(SEED_BLOCK.to)
  );
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const slots = rooms.flatMap((room) =>
  SLOT_WINDOWS.flatMap((window) => {
    const result = [];
    for (
      let m = minutesOf(window.from);
      m + SLOT_MINUTES <= minutesOf(window.to);
      m += SLOT_MINUTES
    ) {
      const local = `${window.date}T${hhmm(m)}`;
      const assignment = slotAssignments[`${room.id}@${local}`];
      const blocked = !assignment && isSeedBlocked(window.date, m);
      result.push({
        id: `seed-slot-${room.id.replace("seed-", "")}-${window.date}-${hhmm(m).replace(":", "")}`,
        roomId: room.id,
        startsAt: gst(local),
        endsAt: gst(`${window.date}T${hhmm(m + SLOT_MINUTES)}`),
        status: blocked
          ? SlotStatus.BLOCKED
          : (assignment?.status ?? SlotStatus.OPEN),
        blockedReason: blocked ? SEED_BLOCK.reason : null,
        meetingRequestId: assignment?.meetingRequestId ?? null,
      });
    }
    return result;
  }),
);

// ---------------------------------------------------------------------------
// A few audit events, so the audit viewer has something to show
// ---------------------------------------------------------------------------

export const auditEvents = [
  ...submissions.map((s) => ({
    id: `seed-audit-${s.id.replace("seed-", "")}`,
    actorId: null,
    action: "submission.create",
    entityType: "Submission",
    entityId: s.id,
    ip: s.ip,
    userAgent: "seed",
    at: s.createdAt,
    metadata: {
      seed: true,
      countryId: s.countryId,
      uploadLinkId: s.uploadLinkId,
      ackTextVersion: s.ackTextVersion,
    },
  })),
  ...publications.map((p) => ({
    id: `seed-audit-publish-${p.projectId.replace("seed-project-", "")}`,
    actorId: p.actorId,
    action: "project.publish",
    entityType: "Project",
    entityId: p.projectId,
    ip: "203.0.113.10",
    userAgent: "seed",
    at: p.at,
    metadata: { seed: true, documentId: p.documentId, onBehalf: p.onBehalf },
  })),
  {
    id: "seed-audit-withdraw-c2",
    actorId: "seed-user-country-c-focal",
    action: "project.withdraw",
    entityType: "Project",
    entityId: "seed-project-c2",
    ip: "203.0.113.10",
    userAgent: "seed",
    at: gst("2026-11-15T17:00"),
    metadata: { seed: true },
  },
  {
    id: "seed-audit-login-failed",
    actorId: null,
    action: "auth.login_failed",
    entityType: "User",
    entityId: null,
    ip: "198.51.100.23",
    userAgent: "seed",
    at: gst("2026-11-16T07:45"),
    metadata: { seed: true, email: "unknown@nowhere.example" },
  },
];

export const seedData = {
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
};
