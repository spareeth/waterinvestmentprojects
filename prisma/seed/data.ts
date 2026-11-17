// Fictional seed data for local and staging. No real countries, people, organisations or projects.
// Pure data: no database access here, so unit tests can check its shape without PostgreSQL.
// Every id starts with "seed-" and every timestamp is fixed, so re-running the seed changes nothing.

import { createHash } from "node:crypto";
import {
  CountryStatus,
  DocumentKind,
  GrantScope,
  MeetingRequestStatus,
  MeetingRequestType,
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  ProjectTier,
  ProjectType,
  ScanStatus,
  SlotStatus,
  UserRole,
  UserStatus,
} from "../../src/generated/prisma/enums";
import { buildPlaceholderPdf } from "./pdf";

/** Summit venue time zone is Gulf Standard Time (UTC+4, no daylight saving). */
export function gst(localDateTime: string): Date {
  return new Date(`${localDateTime}:00+04:00`);
}

export const ACKNOWLEDGEMENT_TEXT_VERSION = "teaser-ack-v1";

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

function user(
  id: string,
  email: string,
  name: string,
  organisation: string,
  jobTitle: string,
  role: UserRole,
  status: UserStatus = UserStatus.ACTIVE,
  pipelineScope: PipelineScope = role === UserRole.INVESTOR
    ? PipelineScope.ALL
    : PipelineScope.NONE,
) {
  return {
    id: `seed-user-${id}`,
    email,
    name,
    organisation,
    jobTitle,
    role,
    status,
    pipelineScope,
    // Demo users enrol their own authenticator app at first sign-in (or skip it where
    // AUTH_SKIP_SECOND_STEP=true). Re-running the seed resets enrolment.
    mfaEnabled: false,
    emailVerified: true,
    termsAcceptedAt: status === UserStatus.ACTIVE ? termsAccepted : null,
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
    UserStatus.ACTIVE,
    // Shows the M4 option: a country user who also sees the other countries' published teasers.
    PipelineScope.ALL,
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
    UserStatus.ACTIVE,
    // Sees only Countries A and B (pipelineCountries below).
    PipelineScope.SELECTED,
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
];

/** Countries visible to users whose pipelineScope is SELECTED. */
export const pipelineCountries = [
  { userId: "seed-user-investor-4", countryId: "seed-country-a" },
  { userId: "seed-user-investor-4", countryId: "seed-country-b" },
];

export const invitations = [
  {
    id: "seed-invitation-investor-1",
    email: "investor@operator-one.example",
    role: UserRole.INVESTOR,
    countryId: null,
    membershipRole: null,
    pipelineScope: PipelineScope.ALL,
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
    pipelineScope: PipelineScope.ALL,
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
    pipelineScope: PipelineScope.NONE,
    tokenHash: sha256Hex("seed-invitation-country-c-member"),
    expiresAt: gst("2026-12-07T23:59"),
    acceptedAt: null,
    invitedById: "seed-user-country-c-focal",
  },
];

// ---------------------------------------------------------------------------
// Projects. Coordinates are arbitrary map positions, not real project locations.
// ---------------------------------------------------------------------------

export const projects = [
  {
    id: "seed-project-a1",
    countryId: "seed-country-a",
    name: "Municipal water network efficiency",
    sector: "Network efficiency",
    tier: ProjectTier.TIER2,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Performance-based contract",
    sizeMinUsd: 60_000_000,
    sizeMaxUsd: 90_000_000,
    tenderTimeline: "Expressions of interest Q1 2027",
    documentsPrepared: "Pre-feasibility study",
    feedbackSought: "Performance indicators, payment mechanism",
    revenueModel: "Availability payments from the utility",
    counterparty: "National water utility (fictional)",
    lat: 12.5,
    lon: 41.0,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-12T10:00"),
  },
  {
    id: "seed-project-a2",
    countryId: "seed-country-a",
    name: "Treated wastewater reuse for irrigation",
    sector: "Wastewater and reuse",
    tier: ProjectTier.TIER2,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Concession",
    sizeMinUsd: 40_000_000,
    sizeMaxUsd: 55_000_000,
    tenderTimeline: "Feasibility update Q2 2027",
    documentsPrepared: "Concept note",
    feedbackSought: "Offtake arrangements with farmers",
    revenueModel: "Tariff on reclaimed water",
    counterparty: "Irrigation agency (fictional)",
    lat: 13.4,
    lon: 42.2,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-12T10:30"),
  },
  {
    id: "seed-project-a3",
    countryId: "seed-country-a",
    name: "Rural water supply clusters",
    sector: "Bulk supply and conveyance",
    tier: ProjectTier.TIER2,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Design, build, operate",
    sizeMinUsd: 25_000_000,
    sizeMaxUsd: 35_000_000,
    tenderTimeline: "To be confirmed",
    documentsPrepared: "Draft concept note",
    feedbackSought: "Bundling of small schemes",
    revenueModel: null,
    counterparty: null,
    lat: 11.8,
    lon: 40.4,
    status: ProjectStatus.DRAFT,
    publishedAt: null,
  },
  {
    id: "seed-project-b1",
    countryId: "seed-country-b",
    name: "Wastewater treatment plants, PPP",
    sector: "Wastewater and reuse",
    tier: ProjectTier.TIER1,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Design, build, finance, operate",
    sizeMinUsd: 180_000_000,
    sizeMaxUsd: 220_000_000,
    tenderTimeline: "RFQ planned Q2 2027",
    documentsPrepared: "Pre-feasibility study",
    feedbackSought: "Risk allocation, revenue model",
    revenueModel: "Availability payments",
    counterparty: "Water authority (fictional)",
    lat: 24.1,
    lon: 52.8,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-11T09:00"),
  },
  {
    id: "seed-project-b2",
    countryId: "seed-country-b",
    name: "Seawater desalination and conveyance",
    sector: "Desalination",
    tier: ProjectTier.TIER1,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Build, operate, transfer",
    sizeMinUsd: 450_000_000,
    sizeMaxUsd: 600_000_000,
    tenderTimeline: "Transaction adviser appointed; RFP Q3 2027",
    documentsPrepared: "Feasibility study, environmental scoping",
    feedbackSought: "Energy supply options, currency risk",
    revenueModel: "Take-or-pay water purchase agreement",
    counterparty: "Bulk water company (fictional)",
    lat: 25.0,
    lon: 54.1,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-11T09:30"),
  },
  {
    id: "seed-project-b3",
    countryId: "seed-country-b",
    name: "Sludge to energy facility",
    sector: "Wastewater and reuse",
    tier: ProjectTier.TIER2,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Design, build, finance, operate",
    sizeMinUsd: 30_000_000,
    sizeMaxUsd: 45_000_000,
    tenderTimeline: null,
    documentsPrepared: null,
    feedbackSought: null,
    revenueModel: null,
    counterparty: null,
    lat: 24.6,
    lon: 53.3,
    status: ProjectStatus.DRAFT,
    publishedAt: null,
  },
  {
    id: "seed-project-c1",
    countryId: "seed-country-c",
    name: "Bulk water supply scheme",
    sector: "Bulk supply and conveyance",
    tier: ProjectTier.TIER1,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Build, own, operate",
    sizeMinUsd: 120_000_000,
    sizeMaxUsd: 150_000_000,
    tenderTimeline: "Prequalification Q1 2027",
    documentsPrepared: "Feasibility study",
    feedbackSought: "Guarantee structure",
    revenueModel: "Bulk water tariff",
    counterparty: "Regional utility (fictional)",
    lat: -1.5,
    lon: 36.2,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-13T11:00"),
  },
  {
    id: "seed-project-c2",
    countryId: "seed-country-c",
    name: "Irrigation modernisation, phase 1",
    sector: "Irrigation",
    tier: ProjectTier.TIER2,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Hybrid PPP",
    sizeMinUsd: 85_000_000,
    sizeMaxUsd: 110_000_000,
    tenderTimeline: "On hold",
    documentsPrepared: "Concept note",
    feedbackSought: "Blended finance options",
    revenueModel: "Service fees from water user associations",
    counterparty: "Irrigation board (fictional)",
    lat: -2.3,
    lon: 37.4,
    // Was published, then withdrawn by the country: investors must no longer see it.
    status: ProjectStatus.WITHDRAWN,
    publishedAt: gst("2026-11-13T11:30"),
  },
  {
    id: "seed-project-d1",
    countryId: "seed-country-d",
    name: "Utility non-revenue water programme",
    sector: "Network efficiency",
    tier: ProjectTier.TIER1,
    projectType: ProjectType.SUMMIT_PIPELINE,
    pppModel: "Lease",
    sizeMinUsd: 70_000_000,
    sizeMaxUsd: 95_000_000,
    tenderTimeline: "RFP Q2 2027",
    documentsPrepared: "Pre-feasibility study",
    feedbackSought: "Baseline data requirements",
    revenueModel: "Share of tariff revenue",
    counterparty: "Municipal utility (fictional)",
    lat: 6.4,
    lon: 3.6,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-14T15:00"),
  },
  {
    id: "seed-project-e1",
    countryId: "seed-country-e",
    name: "Regional reservoir and treatment works",
    sector: "Bulk supply and conveyance",
    tier: ProjectTier.TIER2,
    projectType: ProjectType.OTHER_PROPONENT,
    pppModel: "Design, build, operate",
    sizeMinUsd: 200_000_000,
    sizeMaxUsd: 260_000_000,
    tenderTimeline: "Feasibility Q4 2027",
    documentsPrepared: "Concept note",
    feedbackSought: "Interest from operators",
    revenueModel: "Bulk water tariff",
    counterparty: "River basin authority (fictional)",
    lat: 31.2,
    lon: 70.1,
    status: ProjectStatus.PUBLISHED,
    publishedAt: gst("2026-11-14T15:30"),
  },
];

// ---------------------------------------------------------------------------
// Documents (placeholder PDFs generated deterministically)
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
  kind: DocumentKind;
  title: string;
  filename: string;
  version: number;
  docDate: string;
  allowDownload: boolean;
  scanStatus: ScanStatus;
  uploadedById: string;
  uploadedAt: Date;
  supersededById: string | null;
}

const documentSpecs: DocumentSpec[] = [
  {
    id: "seed-doc-a1-teaser-v1",
    projectId: "seed-project-a1",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-a-network-efficiency-teaser.pdf",
    version: 1,
    docDate: "2026-11-09",
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-a-member",
    uploadedAt: gst("2026-11-11T14:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-a2-teaser-v1",
    projectId: "seed-project-a2",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-a-wastewater-reuse-teaser.pdf",
    version: 1,
    docDate: "2026-11-09",
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-a-focal",
    uploadedAt: gst("2026-11-11T14:30"),
    supersededById: null,
  },
  {
    id: "seed-doc-a3-teaser-v1",
    projectId: "seed-project-a3",
    kind: DocumentKind.TEASER,
    title: "Draft teaser",
    filename: "country-a-rural-supply-draft.pdf",
    version: 1,
    docDate: "2026-11-15",
    allowDownload: false,
    scanStatus: ScanStatus.PENDING,
    uploadedById: "seed-user-country-a-member",
    uploadedAt: gst("2026-11-15T16:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-b1-teaser-v1",
    projectId: "seed-project-b1",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-b-wastewater-ppp-teaser-v1.pdf",
    version: 1,
    docDate: "2026-11-08",
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-b-member",
    uploadedAt: gst("2026-11-10T12:00"),
    supersededById: "seed-doc-b1-teaser-v2",
  },
  {
    id: "seed-doc-b1-teaser-v2",
    projectId: "seed-project-b1",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-b-wastewater-ppp-teaser-v2.pdf",
    version: 2,
    docDate: "2026-11-14",
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-b-focal",
    uploadedAt: gst("2026-11-14T09:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-b1-extra-v1",
    projectId: "seed-project-b1",
    kind: DocumentKind.EXTRA,
    title: "Post-meeting slides",
    filename: "country-b-wastewater-ppp-extra-slides.pdf",
    version: 1,
    docDate: "2026-11-16",
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-b-focal",
    uploadedAt: gst("2026-11-16T10:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-b2-teaser-v1",
    projectId: "seed-project-b2",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-b-desalination-teaser.pdf",
    version: 1,
    docDate: "2026-11-08",
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-b-focal",
    uploadedAt: gst("2026-11-10T12:30"),
    supersededById: null,
  },
  {
    id: "seed-doc-c1-teaser-v1",
    projectId: "seed-project-c1",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-c-bulk-supply-teaser.pdf",
    version: 1,
    docDate: "2026-11-12",
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-c-focal",
    uploadedAt: gst("2026-11-13T10:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-c2-teaser-v1",
    projectId: "seed-project-c2",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-c-irrigation-teaser.pdf",
    version: 1,
    docDate: "2026-11-12",
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-country-c-focal",
    uploadedAt: gst("2026-11-13T10:30"),
    supersededById: null,
  },
  {
    id: "seed-doc-d1-teaser-v1",
    projectId: "seed-project-d1",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-d-nrw-teaser.pdf",
    version: 1,
    docDate: "2026-11-13",
    allowDownload: false,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-summit-admin",
    uploadedAt: gst("2026-11-14T14:00"),
    supersededById: null,
  },
  {
    id: "seed-doc-e1-teaser-v1",
    projectId: "seed-project-e1",
    kind: DocumentKind.TEASER,
    title: "Project teaser",
    filename: "country-e-reservoir-teaser.pdf",
    version: 1,
    docDate: "2026-11-13",
    allowDownload: true,
    scanStatus: ScanStatus.CLEAN,
    uploadedById: "seed-user-summit-admin",
    uploadedAt: gst("2026-11-14T14:30"),
    supersededById: null,
  },
];

function pdfFor(spec: DocumentSpec): Uint8Array {
  const project = projects.find((p) => p.id === spec.projectId);
  const country = countries.find((c) => c.id === project?.countryId);
  if (!project || !country)
    throw new Error(`Seed document ${spec.id} has no project or country`);
  const lines =
    spec.kind === DocumentKind.EXTRA
      ? [
          "Additional material shared after a bilateral meeting.",
          "Visible only to named attendees with a project grant.",
        ]
      : [
          `Sector: ${project.sector}`,
          `Tier: ${project.tier === ProjectTier.TIER1 ? "Tier 1, presented at the Summit" : "Tier 2"}`,
          `PPP model: ${project.pppModel ?? "To be confirmed"}`,
          `Indicative size: ${formatSize(project.sizeMinUsd, project.sizeMaxUsd)}`,
          `Tender timeline: ${project.tenderTimeline ?? "To be confirmed"}`,
          `Documents prepared: ${project.documentsPrepared ?? "None yet"}`,
          `Feedback sought: ${project.feedbackSought ?? "To be confirmed"}`,
        ];
  return buildPlaceholderPdf({
    title: project.name,
    subtitle: `${country.name}. ${spec.title}, version ${spec.version}, ${spec.docDate}`,
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
    docDate: new Date(`${spec.docDate}T00:00:00Z`),
    blobKey,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
  };
});

// ---------------------------------------------------------------------------
// Acknowledgements (one per publication; documentation-range IPs only)
// ---------------------------------------------------------------------------

function ack(
  id: string,
  projectId: string,
  documentId: string,
  userId: string,
  acceptedAt: Date,
  onBehalf?: { evidenceNote: string },
) {
  return {
    id: `seed-ack-${id}`,
    projectId,
    documentId,
    userId,
    textVersion: ACKNOWLEDGEMENT_TEXT_VERSION,
    acceptedAt,
    ip: "203.0.113.10",
    onBehalfOfCountry: Boolean(onBehalf),
    evidenceNote: onBehalf?.evidenceNote ?? null,
  };
}

export const acknowledgements = [
  ack(
    "a1",
    "seed-project-a1",
    "seed-doc-a1-teaser-v1",
    "seed-user-country-a-focal",
    gst("2026-11-12T09:58"),
  ),
  ack(
    "a2",
    "seed-project-a2",
    "seed-doc-a2-teaser-v1",
    "seed-user-country-a-focal",
    gst("2026-11-12T10:28"),
  ),
  ack(
    "b1-v1",
    "seed-project-b1",
    "seed-doc-b1-teaser-v1",
    "seed-user-country-b-focal",
    gst("2026-11-11T08:58"),
  ),
  ack(
    "b1-v2",
    "seed-project-b1",
    "seed-doc-b1-teaser-v2",
    "seed-user-country-b-focal",
    gst("2026-11-14T09:05"),
  ),
  ack(
    "b2",
    "seed-project-b2",
    "seed-doc-b2-teaser-v1",
    "seed-user-country-b-focal",
    gst("2026-11-11T09:28"),
  ),
  ack(
    "c1",
    "seed-project-c1",
    "seed-doc-c1-teaser-v1",
    "seed-user-country-c-focal",
    gst("2026-11-13T10:58"),
  ),
  ack(
    "c2",
    "seed-project-c2",
    "seed-doc-c2-teaser-v1",
    "seed-user-country-c-focal",
    gst("2026-11-13T11:28"),
  ),
  ack(
    "d1",
    "seed-project-d1",
    "seed-doc-d1-teaser-v1",
    "seed-user-summit-admin",
    gst("2026-11-14T14:58"),
    {
      evidenceNote:
        "Fictional: email from the Country D focal point, 13 Nov 2026, confirming the teaser may be shared.",
    },
  ),
  ack(
    "e1",
    "seed-project-e1",
    "seed-doc-e1-teaser-v1",
    "seed-user-summit-admin",
    gst("2026-11-14T15:28"),
    {
      evidenceNote:
        "Fictional: email from the Country E ministry, 13 Nov 2026, confirming the teaser may be shared.",
    },
  ),
];

// ---------------------------------------------------------------------------
// Meeting requests (only on PUBLISHED projects; requesters are investors)
// ---------------------------------------------------------------------------

function request(
  id: string,
  projectId: string,
  requesterId: string,
  type: MeetingRequestType,
  status: MeetingRequestStatus,
  createdAt: Date,
  message: string,
  rank: number | null,
  decision?: { decidedById: string; decidedAt: Date; onBehalf?: boolean },
) {
  return {
    id: `seed-request-${id}`,
    projectId,
    requesterId,
    type,
    message,
    rank,
    status,
    decidedById: decision?.decidedById ?? null,
    decidedOnBehalf: decision?.onBehalf ?? false,
    decidedAt: decision?.decidedAt ?? null,
    createdAt,
  };
}

const { MEETING, INFO } = MeetingRequestType;
const { PENDING, ACCEPTED, DECLINED, WITHDRAWN } = MeetingRequestStatus;

export const meetingRequests = [
  request(
    "01",
    "seed-project-b1",
    "seed-user-investor-1",
    MEETING,
    PENDING,
    gst("2026-11-15T10:00"),
    "We would welcome a bilateral meeting on the PPP structure.",
    1,
  ),
  request(
    "02",
    "seed-project-b2",
    "seed-user-investor-2",
    MEETING,
    ACCEPTED,
    gst("2026-11-15T11:00"),
    "Interested in the energy supply arrangements.",
    1,
    {
      decidedById: "seed-user-country-b-focal",
      decidedAt: gst("2026-11-16T09:00"),
    },
  ),
  request(
    "03",
    "seed-project-b1",
    "seed-user-investor-3",
    MEETING,
    ACCEPTED,
    gst("2026-11-14T12:00"),
    "Keen to discuss the financing plan.",
    2,
    {
      decidedById: "seed-user-country-b-focal",
      decidedAt: gst("2026-11-15T09:00"),
    },
  ),
  request(
    "04",
    "seed-project-b2",
    "seed-user-investor-4",
    MEETING,
    PENDING,
    gst("2026-11-14T16:00"),
    "Request for a meeting with the project team.",
    null,
  ),
  request(
    "05",
    "seed-project-a1",
    "seed-user-investor-2",
    INFO,
    PENDING,
    gst("2026-11-15T13:00"),
    "Could you share the baseline loss figures?",
    2,
  ),
  request(
    "06",
    "seed-project-c1",
    "seed-user-investor-1",
    MEETING,
    DECLINED,
    gst("2026-11-14T09:00"),
    "Would like to explore participation as operator.",
    2,
    {
      decidedById: "seed-user-country-c-focal",
      decidedAt: gst("2026-11-15T15:00"),
    },
  ),
  request(
    "07",
    "seed-project-d1",
    "seed-user-investor-3",
    MEETING,
    ACCEPTED,
    gst("2026-11-15T08:30"),
    "Interested in the lease model.",
    1,
    {
      decidedById: "seed-user-summit-admin",
      decidedAt: gst("2026-11-16T11:00"),
      onBehalf: true,
    },
  ),
  request(
    "08",
    "seed-project-a2",
    "seed-user-investor-4",
    INFO,
    WITHDRAWN,
    gst("2026-11-13T10:00"),
    "Please share the offtake study.",
    null,
  ),
  request(
    "09",
    "seed-project-e1",
    "seed-user-investor-1",
    MEETING,
    ACCEPTED,
    gst("2026-11-15T14:00"),
    "Interested in operating the treatment works.",
    3,
    {
      decidedById: "seed-user-summit-admin",
      decidedAt: gst("2026-11-16T12:00"),
      onBehalf: true,
    },
  ),
  request(
    "10",
    "seed-project-c1",
    "seed-user-investor-2",
    INFO,
    DECLINED,
    gst("2026-11-14T17:00"),
    "Is a sovereign guarantee planned?",
    null,
    {
      decidedById: "seed-user-country-c-focal",
      decidedAt: gst("2026-11-15T15:30"),
    },
  ),
  request(
    "11",
    "seed-project-e1",
    "seed-user-investor-4",
    INFO,
    WITHDRAWN,
    gst("2026-11-15T09:00"),
    "Could you share the hydrology summary?",
    null,
  ),
];

// ---------------------------------------------------------------------------
// Rooms and 30-minute slots: 8 Dec 09:00 to 17:00, 9 Dec 09:00 to 12:30 (GST)
// ---------------------------------------------------------------------------

export const rooms = [
  { id: "seed-room-1", name: "Bilateral room 1", capacity: 8 },
  { id: "seed-room-2", name: "Bilateral room 2", capacity: 8 },
];

export const SLOT_WINDOWS = [
  { date: "2026-12-08", from: "09:00", to: "17:00" },
  { date: "2026-12-09", from: "09:00", to: "12:30" },
];

/** Bookings and holds keyed by "<roomId>@<local date>T<time>". Only ACCEPTED requests appear here. */
const slotAssignments: Record<
  string,
  { status: SlotStatus; meetingRequestId: string }
> = {
  "seed-room-1@2026-12-08T10:30": {
    status: SlotStatus.BOOKED,
    meetingRequestId: "seed-request-03",
  },
  "seed-room-1@2026-12-08T10:00": {
    status: SlotStatus.HELD,
    meetingRequestId: "seed-request-02",
  },
  "seed-room-2@2026-12-09T09:30": {
    status: SlotStatus.BOOKED,
    meetingRequestId: "seed-request-07",
  },
};

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
      result.push({
        id: `seed-slot-${room.id.replace("seed-", "")}-${window.date}-${hhmm(m).replace(":", "")}`,
        roomId: room.id,
        startsAt: gst(local),
        endsAt: gst(`${window.date}T${hhmm(m + SLOT_MINUTES)}`),
        status: assignment?.status ?? SlotStatus.OPEN,
        meetingRequestId: assignment?.meetingRequestId ?? null,
      });
    }
    return result;
  }),
);

// ---------------------------------------------------------------------------
// Project grant for extra material (F11)
// ---------------------------------------------------------------------------

export const projectGrants = [
  {
    id: "seed-grant-b1-investor-3",
    userId: "seed-user-investor-3",
    projectId: "seed-project-b1",
    scope: GrantScope.EXTRA,
    grantedById: "seed-user-country-b-focal",
    expiresAt: gst("2026-12-31T23:59"),
    revokedAt: null,
  },
];

// ---------------------------------------------------------------------------
// A few audit events, so the audit viewer has something to show
// ---------------------------------------------------------------------------

export const auditEvents = [
  ...acknowledgements.map((a) => ({
    id: `seed-audit-publish-${a.id.replace("seed-ack-", "")}`,
    actorId: a.userId,
    action: "project.publish",
    entityType: "Project",
    entityId: a.projectId,
    ip: a.ip,
    userAgent: "seed",
    at: a.acceptedAt,
    metadata: {
      seed: true,
      acknowledgementId: a.id,
      documentId: a.documentId,
      onBehalfOfCountry: a.onBehalfOfCountry,
    },
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
    id: "seed-audit-grant-b1",
    actorId: "seed-user-country-b-focal",
    action: "grant.create",
    entityType: "ProjectGrant",
    entityId: "seed-grant-b1-investor-3",
    ip: "203.0.113.10",
    userAgent: "seed",
    at: gst("2026-11-16T10:05"),
    metadata: { seed: true, scope: GrantScope.EXTRA },
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
};
