import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { MeetingRequestStatus } from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  canDecideMeetingRequest,
  canExportMeetingRequests,
  canRequestMeeting,
  canViewRequestInbox,
  canWithdrawMeetingRequest,
  actsOnBehalf,
  meetingRequestWhere,
  PROJECT_POLICY_SELECT,
  requestInboxWhere,
  type Viewer,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { type Mailer, notifySummitTeam, sendMail } from "@/lib/mail";
import { formatMeetingSlot } from "@/lib/meetings/schedule";
import {
  bookHeldSlot,
  holdSlot,
  listMeetingTimes,
  releaseSlot,
  SLOT_DISPLAY_SELECT,
} from "@/lib/meetings/slots";
import { toCsv } from "./csv";
import { type ProjectDemand, summariseDemand } from "./demand";
import {
  type DecisionOutcome,
  focalPointRequestEmail,
  investorDecisionEmail,
  type RequestMailFacts,
  summitRequestNotice,
} from "./emails";
import { RequestError } from "./errors";
import type { RequestInput } from "./input";

// Meeting requests (M5, PLAN v0.3 F5, F6 and the request export of F7). Investors request a bilateral meeting on a
// PUBLISHED project (organisation, role, short note; no ranking, no limit) and may withdraw it; the country's focal
// point (or an admin) accepts or declines; WBG coordinators read their countries' requests. Every permission goes
// through src/lib/authz; every write and its AuditEvent share one transaction; emails go out after the commit and
// never throw (src/lib/mail). Server actions and the export route are thin wrappers; integration tests call these
// functions directly.

export const REQUEST_AUDIT = {
  CREATE: "meeting_request.create",
  WITHDRAW: "meeting_request.withdraw",
  ACCEPT: "meeting_request.accept",
  DECLINE: "meeting_request.decline",
  LIST: "meeting_request.list",
  EXPORT: "meeting_request.export",
} as const;

export { RequestError, type RequestErrorCode } from "./errors";

/** A request is "open" while the investor still expects (or has) a meeting. One open request per project. */
export const OPEN_STATUSES: MeetingRequestStatus[] = [
  MeetingRequestStatus.PENDING,
  MeetingRequestStatus.ACCEPTED,
];

/** Requests younger than this are marked "New" on the inbox (no email needed, PLAN 0a.5). */
export const NEW_REQUEST_HOURS = 24;

export function isNewRequest(createdAt: Date, now: Date = new Date()) {
  return now.getTime() - createdAt.getTime() < NEW_REQUEST_HOURS * 3_600_000;
}

/** Which emails besides the Summit notice go out. Off by default until WBG decides (user decision, 18 Nov). */
export interface RequestNotifySettings {
  /** New request: to the country's FOCAL_POINT contacts, WBG_COORDINATOR contacts in copy. */
  focalPoints: boolean;
  /** Decision: to the investor. */
  investor: boolean;
}

export function requestNotifySettings(): RequestNotifySettings {
  const env = getEnv();
  return {
    focalPoints: env.REQUEST_NOTIFY_FOCAL_POINTS,
    investor: env.REQUEST_NOTIFY_INVESTOR,
  };
}

export interface RequestOptions {
  meta?: RequestMeta;
  now?: Date;
  /** Tests pass a MemoryMailer. */
  mailer?: Mailer;
  /** Defaults to the REQUEST_NOTIFY_* switches. */
  notify?: RequestNotifySettings;
  /** Defaults to ADMIN_NOTIFY_EMAIL. */
  summitRecipients?: string[];
}

const POLICY_SELECT = {
  id: true,
  requesterId: true,
  status: true,
  project: { select: { countryId: true } },
} satisfies Prisma.MeetingRequestSelect;

/** The attendee as typed on the request; the account's name and email for requests made before those fields. */
export function requestContact(row: {
  contactName: string;
  contactEmail: string;
  requester: { name: string; email: string };
}): { name: string; email: string } {
  return {
    name: row.contactName || row.requester.name,
    email: row.contactEmail || row.requester.email,
  };
}

const MAIL_SELECT = {
  id: true,
  organisation: true,
  role: true,
  note: true,
  createdAt: true,
  contactName: true,
  contactEmail: true,
  requester: { select: { name: true, email: true } },
  slot: { select: SLOT_DISPLAY_SELECT },
  project: {
    select: {
      title: true,
      countryId: true,
      country: { select: { name: true } },
    },
  },
} satisfies Prisma.MeetingRequestSelect;

type MailRow = Prisma.MeetingRequestGetPayload<{ select: typeof MAIL_SELECT }>;

function mailFacts(row: MailRow): RequestMailFacts {
  const contact = requestContact(row);
  return {
    requestId: row.id,
    projectTitle: row.project.title,
    countryName: row.project.country.name,
    investorName: contact.name,
    investorEmail: contact.email,
    meetingTime: row.slot ? formatMeetingSlot(row.slot) : null,
    organisation: row.organisation,
    role: row.role,
    note: row.note,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Investor side
// ---------------------------------------------------------------------------

/**
 * What the request panel on a project page needs: whether the viewer may request a meeting, their open request on
 * this project (if any), the form's pre-filled attendee, organisation and role, and the meeting times to choose
 * from. Null when the panel should not show.
 */
export async function getRequestPanel(
  viewer: Viewer,
  projectId: string,
  { now = new Date() }: { now?: Date } = {},
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, ...PROJECT_POLICY_SELECT },
  });
  if (!project || !canRequestMeeting(viewer, project)) return null;
  const [open, user] = await Promise.all([
    db.meetingRequest.findFirst({
      where: {
        AND: [
          meetingRequestWhere(viewer),
          {
            projectId,
            requesterId: viewer.id,
            status: { in: OPEN_STATUSES },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        slot: { select: SLOT_DISPLAY_SELECT },
      },
    }),
    db.user.findUnique({
      where: { id: viewer.id },
      select: { name: true, email: true, organisation: true, jobTitle: true },
    }),
  ]);
  const times = open
    ? []
    : await listMeetingTimes(viewer.id, project.countryId, now);
  return {
    projectId,
    open,
    times,
    defaults: {
      contactName: user?.name ?? "",
      contactEmail: user?.email ?? "",
      organisation: user?.organisation ?? "",
      role: user?.jobTitle ?? "",
      note: "",
      slot: "",
    },
  };
}

/** True while at least one meeting time is free for this investor and project, so the form must ask for one. */
export async function meetingTimeRequired(
  viewer: Viewer,
  projectId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { countryId: true },
  });
  if (!project) return false;
  const days = await listMeetingTimes(viewer.id, project.countryId, now);
  return days.some((d) => d.times.some((t) => t.available));
}

/**
 * An investor requests a meeting on a published project. Refused with "not_found" when the viewer may not request
 * one (the project is not in their pipeline, or they are not an investor), and "already_requested" while they
 * have an open request on the same project. Tells the Summit mailbox, and the focal points when switched on.
 */
export async function createMeetingRequest(
  viewer: Viewer,
  projectId: string,
  input: RequestInput,
  options: RequestOptions = {},
): Promise<{ id: string }> {
  const { meta, now = new Date() } = options;
  const created = await db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, ...PROJECT_POLICY_SELECT },
    });
    if (!project || !canRequestMeeting(viewer, project)) {
      throw new RequestError("not_found");
    }
    // Serialises requests by the same investor on the same project, so a double click cannot make two.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`meeting-request:${viewer.id}:${projectId}`}))`;
    const open = await tx.meetingRequest.count({
      where: {
        projectId,
        requesterId: viewer.id,
        status: { in: OPEN_STATUSES },
      },
    });
    if (open > 0) throw new RequestError("already_requested");
    const created = await tx.meetingRequest.create({
      data: {
        projectId,
        requesterId: viewer.id,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        organisation: input.organisation,
        role: input.role,
        note: input.note,
        createdAt: now,
      },
      select: { id: true },
    });
    if (input.slotStartsAt) {
      await holdSlot(
        tx,
        {
          id: created.id,
          requesterId: viewer.id,
          countryId: project.countryId,
        },
        input.slotStartsAt,
        now,
      );
    }
    const row = await tx.meetingRequest.findUniqueOrThrow({
      where: { id: created.id },
      select: MAIL_SELECT,
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: REQUEST_AUDIT.CREATE,
        entityType: "MeetingRequest",
        entityId: row.id,
        meta,
        metadata: {
          projectId,
          countryId: project.countryId,
          ...(row.slot
            ? {
                slotStartsAt: row.slot.startsAt.toISOString(),
                room: row.slot.room.name,
              }
            : {}),
        },
      },
      tx,
    );
    return row;
  });

  await notifyNewRequest(created, options);
  return { id: created.id };
}

async function notifyNewRequest(row: MailRow, options: RequestOptions) {
  const { meta, mailer } = options;
  const notify = options.notify ?? requestNotifySettings();
  const facts = mailFacts(row);
  const target = {
    entityType: "MeetingRequest",
    entityId: row.id,
    meta,
    mailer,
  };
  await notifySummitTeam("meeting_request.summit", summitRequestNotice(facts), {
    ...target,
    recipients: options.summitRecipients,
  });
  if (!notify.focalPoints) return;
  const contacts = await db.countryContact.findMany({
    where: { countryId: row.project.countryId },
    select: { email: true, role: true },
    orderBy: { email: "asc" },
  });
  const to = contacts
    .filter((c) => c.role === "FOCAL_POINT")
    .map((c) => c.email);
  const cc = contacts
    .filter((c) => c.role === "WBG_COORDINATOR")
    .map((c) => c.email)
    .filter((email) => !to.includes(email));
  // No focal point yet: the Summit mailbox already has the notice; never send the coordinator alone.
  if (to.length === 0) return;
  await sendMail(
    "meeting_request.focal_point",
    { to, cc, ...focalPointRequestEmail(facts) },
    target,
  );
}

/** The investor withdraws their own request while it is pending or accepted. */
export async function withdrawMeetingRequest(
  viewer: Viewer,
  requestId: string,
  { meta, now = new Date() }: RequestOptions = {},
): Promise<void> {
  await db.$transaction(async (tx) => {
    const request = await tx.meetingRequest.findFirst({
      where: { AND: [{ id: requestId }, meetingRequestWhere(viewer)] },
      select: POLICY_SELECT,
    });
    if (!request) throw new RequestError("not_found");
    if (request.requesterId !== viewer.id) throw new RequestError("forbidden");
    if (!canWithdrawMeetingRequest(viewer, request)) {
      throw new RequestError("not_open");
    }
    const { count } = await tx.meetingRequest.updateMany({
      where: { id: request.id, status: request.status },
      data: { status: MeetingRequestStatus.WITHDRAWN, updatedAt: now },
    });
    if (count !== 1) throw new RequestError("not_open");
    await releaseSlot(tx, request.id);
    await writeAudit(
      {
        actorId: viewer.id,
        action: REQUEST_AUDIT.WITHDRAW,
        entityType: "MeetingRequest",
        entityId: request.id,
        meta,
        metadata: {
          countryId: request.project.countryId,
          previousStatus: request.status,
        },
      },
      tx,
    );
  });
}

const MINE_SELECT = {
  id: true,
  organisation: true,
  role: true,
  note: true,
  contactName: true,
  contactEmail: true,
  slot: { select: SLOT_DISPLAY_SELECT },
  requester: { select: { name: true, email: true } },
  status: true,
  createdAt: true,
  decidedAt: true,
  requesterId: true,
  project: {
    select: {
      id: true,
      title: true,
      sector: true,
      countryId: true,
      country: { select: { name: true } },
    },
  },
} satisfies Prisma.MeetingRequestSelect;

export type MyRequest = Prisma.MeetingRequestGetPayload<{
  select: typeof MINE_SELECT;
}>;

/** "My meeting requests": the viewer's own requests, newest first. Audited as a list view. */
export async function listMyRequests(
  viewer: Viewer,
  { meta }: RequestOptions = {},
): Promise<MyRequest[]> {
  const rows = await db.meetingRequest.findMany({
    where: { AND: [meetingRequestWhere(viewer), { requesterId: viewer.id }] },
    orderBy: { createdAt: "desc" },
    select: MINE_SELECT,
  });
  await writeAudit({
    actorId: viewer.id,
    action: REQUEST_AUDIT.LIST,
    entityType: "MeetingRequest",
    meta,
    metadata: { view: "mine", count: rows.length },
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Country side: inbox, decisions, export
// ---------------------------------------------------------------------------

export interface InboxFilter {
  countryId?: string;
  status?: MeetingRequestStatus;
}

function inboxWhere(
  viewer: Viewer,
  filter: InboxFilter = {},
): Prisma.MeetingRequestWhereInput {
  return {
    AND: [
      requestInboxWhere(viewer),
      filter.countryId ? { project: { countryId: filter.countryId } } : {},
      filter.status ? { status: filter.status } : {},
    ],
  };
}

const INBOX_SELECT = {
  id: true,
  organisation: true,
  role: true,
  note: true,
  contactName: true,
  contactEmail: true,
  slot: { select: SLOT_DISPLAY_SELECT },
  status: true,
  createdAt: true,
  decidedAt: true,
  requesterId: true,
  requester: { select: { name: true, email: true } },
  decidedBy: { select: { name: true } },
  project: {
    select: {
      id: true,
      title: true,
      sector: true,
      countryId: true,
      country: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.MeetingRequestSelect;

export type InboxRequest = Prisma.MeetingRequestGetPayload<{
  select: typeof INBOX_SELECT;
}> & { canDecide: boolean };

/**
 * The request inbox: requests on the projects of the viewer's countries (all countries for admins), newest first,
 * each with whether the viewer may decide it. Empty for anyone without an inbox. Audited as a list view.
 */
export async function listInboxRequests(
  viewer: Viewer,
  filter: InboxFilter = {},
  { meta }: RequestOptions = {},
): Promise<InboxRequest[]> {
  if (!canViewRequestInbox(viewer)) return [];
  const rows = await db.meetingRequest.findMany({
    where: inboxWhere(viewer, filter),
    orderBy: [{ createdAt: "desc" }],
    select: INBOX_SELECT,
  });
  await writeAudit({
    actorId: viewer.id,
    action: REQUEST_AUDIT.LIST,
    entityType: "MeetingRequest",
    meta,
    metadata: {
      view: "inbox",
      count: rows.length,
      ...(filter.countryId ? { countryId: filter.countryId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
  });
  return rows.map((row) => ({
    ...row,
    canDecide: canDecideMeetingRequest(viewer, row),
  }));
}

export interface RequestCounts {
  total: number;
  pending: number;
  /** Pending requests younger than NEW_REQUEST_HOURS. */
  newPending: number;
}

/**
 * M13 (PLAN v0.4 0b.16): meeting request counts per project by the requester's organisation type, for the
 * country's "My projects". Only requests in the viewer's inbox (own countries; admins all), so a country never
 * learns about another country's requests; no requester names leave this function. Withdrawn requests are left out.
 */
export async function getProjectDemand(
  viewer: Viewer,
  projectIds: string[],
): Promise<Map<string, ProjectDemand>> {
  if (!canViewRequestInbox(viewer) || projectIds.length === 0) {
    return new Map();
  }
  const rows = await db.meetingRequest.findMany({
    where: {
      AND: [
        inboxWhere(viewer),
        { projectId: { in: projectIds } },
        { status: { not: MeetingRequestStatus.WITHDRAWN } },
      ],
    },
    select: {
      projectId: true,
      requester: { select: { organisationType: true } },
    },
  });
  return summariseDemand(
    rows.map((r) => ({
      projectId: r.projectId,
      organisationType: r.requester.organisationType,
    })),
  );
}

/** Counts for the inbox and the home page (the notification that does not depend on email). */
export async function getRequestCounts(
  viewer: Viewer,
  { now = new Date() }: RequestOptions = {},
): Promise<RequestCounts> {
  if (!canViewRequestInbox(viewer))
    return { total: 0, pending: 0, newPending: 0 };
  const where = inboxWhere(viewer);
  const since = new Date(now.getTime() - NEW_REQUEST_HOURS * 3_600_000);
  const [total, pending, newPending] = await Promise.all([
    db.meetingRequest.count({ where }),
    db.meetingRequest.count({
      where: { AND: [where, { status: MeetingRequestStatus.PENDING }] },
    }),
    db.meetingRequest.count({
      where: {
        AND: [
          where,
          { status: MeetingRequestStatus.PENDING, createdAt: { gte: since } },
        ],
      },
    }),
  ]);
  return { total, pending, newPending };
}

/** Countries in the viewer's inbox, for the country filter (admins: every country with a request). */
export async function listInboxCountries(viewer: Viewer) {
  if (!canViewRequestInbox(viewer)) return [];
  return db.country.findMany({
    where: {
      projects: { some: { meetingRequests: { some: inboxWhere(viewer) } } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * The focal point (or an admin for the country) accepts or declines a PENDING request. Decisions are final for
 * now (user decision, 18 Nov). "not_found" when the viewer cannot see the request at all, "forbidden" when they
 * see it but may not decide (a WBG coordinator). Emails the investor when REQUEST_NOTIFY_INVESTOR is on.
 */
export async function decideMeetingRequest(
  viewer: Viewer,
  requestId: string,
  outcome: DecisionOutcome,
  options: RequestOptions = {},
): Promise<void> {
  const { meta, now = new Date(), mailer } = options;
  const notify = options.notify ?? requestNotifySettings();
  const decided = await db.$transaction(async (tx) => {
    const request = await tx.meetingRequest.findFirst({
      where: { AND: [{ id: requestId }, requestInboxWhere(viewer)] },
      select: POLICY_SELECT,
    });
    if (!request) throw new RequestError("not_found");
    if (!canDecideMeetingRequest(viewer, request)) {
      throw new RequestError(
        request.status === MeetingRequestStatus.PENDING
          ? "forbidden"
          : "not_pending",
      );
    }
    const { count } = await tx.meetingRequest.updateMany({
      where: { id: request.id, status: MeetingRequestStatus.PENDING },
      data: {
        status: outcome,
        decidedById: viewer.id,
        decidedAt: now,
        updatedAt: now,
      },
    });
    if (count !== 1) throw new RequestError("not_pending");
    if (outcome === MeetingRequestStatus.ACCEPTED) {
      await bookHeldSlot(tx, request.id);
    } else {
      await releaseSlot(tx, request.id);
    }
    await writeAudit(
      {
        actorId: viewer.id,
        action:
          outcome === MeetingRequestStatus.ACCEPTED
            ? REQUEST_AUDIT.ACCEPT
            : REQUEST_AUDIT.DECLINE,
        entityType: "MeetingRequest",
        entityId: request.id,
        meta,
        metadata: {
          countryId: request.project.countryId,
          onBehalf: actsOnBehalf(viewer, request.project.countryId),
        },
      },
      tx,
    );
    return tx.meetingRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: MAIL_SELECT,
    });
  });

  if (notify.investor) {
    const facts = mailFacts(decided);
    await sendMail(
      "meeting_request.decision",
      { to: [facts.investorEmail], ...investorDecisionEmail(facts, outcome) },
      { entityType: "MeetingRequest", entityId: decided.id, meta, mailer },
    );
  }
}

const UAE_CSV_TIME = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Dubai",
});

function csvTime(date: Date | null): string {
  return date ? UAE_CSV_TIME.format(date) : "";
}

const STATUS_LABEL: Record<MeetingRequestStatus, string> = {
  PENDING: "Awaiting reply",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

export const EXPORT_HEADER = [
  "Reference",
  "Requested (UAE time)",
  "Country",
  "Project",
  "Sector",
  "Status",
  "Meeting time (UAE time)",
  "Room",
  "Investor name",
  "Investor email",
  "Organisation",
  "Role",
  "Note",
  "Account email",
  "Decided by",
  "Decided (UAE time)",
] as const;

/**
 * The request list as CSV (also the contact list kept after the Summit): admins every country (or one), focal
 * points and WBG coordinators their own countries. Throws "forbidden" for anyone else. Audited with the row count.
 */
export async function exportRequestsCsv(
  viewer: Viewer,
  filter: InboxFilter = {},
  { meta }: RequestOptions = {},
): Promise<{ csv: string; count: number }> {
  if (!canExportMeetingRequests(viewer)) throw new RequestError("forbidden");
  const rows = await db.meetingRequest.findMany({
    where: inboxWhere(viewer, filter),
    orderBy: [
      { project: { country: { name: "asc" } } },
      { project: { title: "asc" } },
      { createdAt: "asc" },
    ],
    select: INBOX_SELECT,
  });
  await writeAudit({
    actorId: viewer.id,
    action: REQUEST_AUDIT.EXPORT,
    entityType: "MeetingRequest",
    meta,
    metadata: {
      count: rows.length,
      ...(filter.countryId ? { countryId: filter.countryId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
  });
  const csv = toCsv(
    EXPORT_HEADER,
    rows.map((r) => [
      r.id,
      csvTime(r.createdAt),
      r.project.country.name,
      r.project.title,
      r.project.sector,
      STATUS_LABEL[r.status],
      r.slot ? csvTime(r.slot.startsAt) : "",
      r.slot?.room.name ?? "",
      requestContact(r).name,
      requestContact(r).email,
      r.organisation,
      r.role,
      r.note,
      r.requester.email,
      r.decidedBy?.name ?? "",
      csvTime(r.decidedAt),
    ]),
  );
  return { csv, count: rows.length };
}
