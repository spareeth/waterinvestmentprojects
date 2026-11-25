import "server-only";
import { MeetingSignupStatus } from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  canManageMeetingBlocks,
  canSignUpForMeetings,
  canViewSignupList,
  canWithdrawSignup,
  meetingSignupWhere,
  NO_SIGNUP,
  PROJECT_POLICY_SELECT,
  pipelineProjectWhere,
  type Viewer,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/requests/csv";
import {
  parseRequestInput,
  type RequestFormValues,
} from "@/lib/requests/input";
import {
  BLOCK_ROOMS,
  blockSlotStarts,
  formatMeetingDay,
  formatSignupSlot,
  formatSignupSlotWithDay,
  MEETING_SIGNUP,
  signupDeadlinePassed,
  uaeDateKey,
  uaeTime,
} from "./schedule";

// Meeting sign-ups (25 Nov, WBG: Jacob Kim; meeting notes of 23 and 24 Nov). An investor signs up once per country,
// from any of its projects: who will attend, organisation and role, the projects of interest and every time they
// could make inside the country's blocks. Sign-ups are not bookings: other investors are never blocked, and the
// Summit team allocates the meetings after the deadline (MEETING_SIGNUP). Every permission goes through
// src/lib/authz (signups.ts); every write and its AuditEvent share one transaction.

export const SIGNUP_AUDIT = {
  CREATE: "meeting_signup.create",
  UPDATE: "meeting_signup.update",
  WITHDRAW: "meeting_signup.withdraw",
  LIST: "meeting_signup.list",
  EXPORT: "meeting_signup.export",
  BLOCKS_IMPORT: "meeting_block.import",
  COUNTERPARTS_UPDATE: "country.counterparts_update",
} as const;

export type SignupErrorCode = "not_found" | "forbidden" | "closed" | "invalid";

export class SignupError extends Error {
  constructor(
    public readonly code: SignupErrorCode,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(`Meeting sign-up refused: ${code}`);
    this.name = "SignupError";
  }
}

export const SIGNUP_MESSAGES: Record<SignupErrorCode, string> = {
  not_found: "This project could not be found.",
  forbidden: "You do not have permission to do this.",
  closed: `Sign-ups for meetings closed on ${MEETING_SIGNUP.deadlineLabel}. Contact the Summit team if you need a meeting.`,
  invalid: "Check the highlighted fields and try again.",
};

interface Options {
  meta?: RequestMeta;
  now?: Date;
}

/** Non-empty lines of the country's counterparts text. */
export function counterpartLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export interface SignupDay {
  key: string;
  label: string;
  times: { value: string; label: string; chosen: boolean }[];
}

/** The 30-minute starts inside the blocks, grouped by UAE day, marked as chosen when on the sign-up. */
export function signupDays(
  blocks: readonly { startsAt: Date; endsAt: Date }[],
  chosen: readonly Date[] = [],
): SignupDay[] {
  const picked = new Set(chosen.map((d) => d.getTime()));
  const days = new Map<string, SignupDay>();
  for (const start of blockSlotStarts(blocks)) {
    const key = uaeDateKey(start);
    let day = days.get(key);
    if (!day) {
      day = { key, label: formatMeetingDay(start), times: [] };
      days.set(key, day);
    }
    day.times.push({
      value: start.toISOString(),
      label: formatSignupSlot(start),
      chosen: picked.has(start.getTime()),
    });
  }
  return [...days.values()];
}

/**
 * The sign-up sheet on a project page: the country's counterparts and time slots, its projects in the pipeline,
 * and the investor's own sign-up for the country if there is one. Null for anyone who may not sign up (only
 * investors, and only on projects in the pipeline). After the deadline the sheet is read-only.
 */
export async function getSignupPanel(
  viewer: Viewer,
  projectId: string,
  { now = new Date() }: { now?: Date } = {},
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, ...PROJECT_POLICY_SELECT },
  });
  if (!project || !canSignUpForMeetings(viewer, project, false)) return null;
  const countryId = project.countryId;
  const [country, blocks, projects, signup, user] = await Promise.all([
    db.country.findUniqueOrThrow({
      where: { id: countryId },
      select: { id: true, name: true, meetingCounterparts: true },
    }),
    db.meetingBlock.findMany({
      where: { countryId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, endsAt: true },
    }),
    db.project.findMany({
      where: { AND: [pipelineProjectWhere(viewer), { countryId }] },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    db.meetingSignup.findFirst({
      where: { AND: [meetingSignupWhere(viewer), { countryId }] },
      select: {
        id: true,
        status: true,
        contactName: true,
        contactEmail: true,
        organisation: true,
        role: true,
        note: true,
        slotStarts: true,
        updatedAt: true,
        projects: { select: { projectId: true } },
      },
    }),
    db.user.findUnique({
      where: { id: viewer.id },
      select: { name: true, email: true, organisation: true, jobTitle: true },
    }),
  ]);
  const active = signup?.status === MeetingSignupStatus.ACTIVE ? signup : null;
  const chosenProjects = new Set(
    active ? active.projects.map((p) => p.projectId) : [projectId],
  );
  return {
    projectId,
    country: {
      id: country.id,
      name: country.name,
      counterparts: counterpartLines(country.meetingCounterparts),
    },
    days: signupDays(blocks, active?.slotStarts ?? []),
    projects: projects.map((p) => ({
      ...p,
      chosen: chosenProjects.has(p.id),
    })),
    signup: active ? { id: active.id, updatedAt: active.updatedAt } : null,
    defaults: {
      contactName: active?.contactName ?? user?.name ?? "",
      contactEmail: active?.contactEmail ?? user?.email ?? "",
      organisation: active?.organisation ?? user?.organisation ?? "",
      role: active?.role ?? user?.jobTitle ?? "",
      note: active?.note ?? "",
    },
    closed: signupDeadlinePassed(now),
  };
}

export interface SignupInput extends Omit<RequestFormValues, "slot"> {
  slotStarts: string[];
  projectIds: string[];
}

/**
 * Creates or updates the investor's sign-up for the project's country (one per investor and country). Every
 * chosen time must be a start inside the country's blocks, at least one is needed, and the projects of interest
 * must be the country's projects in the pipeline (the current project when none is ticked).
 */
export async function saveSignup(
  viewer: Viewer,
  projectId: string,
  values: SignupInput,
  { meta, now = new Date() }: Options = {},
): Promise<{ id: string; created: boolean }> {
  const parsed = parseRequestInput({ ...values, slot: "" });
  const fieldErrors: Record<string, string> = parsed.ok
    ? {}
    : { ...parsed.fieldErrors };
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, ...PROJECT_POLICY_SELECT },
    });
    if (!project || !canSignUpForMeetings(viewer, project, false)) {
      throw new SignupError("not_found");
    }
    if (signupDeadlinePassed(now)) throw new SignupError("closed");
    const countryId = project.countryId;

    const blocks = await tx.meetingBlock.findMany({
      where: { countryId },
      select: { startsAt: true, endsAt: true },
    });
    const allowed = new Map(
      blockSlotStarts(blocks).map((d) => [d.toISOString(), d]),
    );
    const chosen = [
      ...new Set(values.slotStarts.map((v) => v.trim()).filter(Boolean)),
    ];
    const starts: Date[] = [];
    for (const value of chosen) {
      const start = allowed.get(new Date(value).toISOString());
      if (!start || Number.isNaN(Date.parse(value))) {
        fieldErrors.slots = "Choose times from the list.";
        break;
      }
      starts.push(start);
    }
    if (starts.length === 0) {
      fieldErrors.slots ??= "Tick at least one time you could meet.";
    }

    const wanted = [
      ...new Set(
        (values.projectIds.length > 0 ? values.projectIds : [projectId]).map(
          (id) => id.trim(),
        ),
      ),
    ];
    const projects = await tx.project.findMany({
      where: {
        AND: [pipelineProjectWhere(viewer), { countryId, id: { in: wanted } }],
      },
      select: { id: true },
    });
    if (projects.length !== wanted.length || projects.length === 0) {
      fieldErrors.projects =
        "Choose one or more of this country's projects from the list.";
    }
    if (Object.keys(fieldErrors).length > 0 || !parsed.ok) {
      throw new SignupError("invalid", fieldErrors);
    }
    const contact = parsed.input;
    starts.sort((a, b) => a.getTime() - b.getTime());

    const existing = await tx.meetingSignup.findUnique({
      where: {
        countryId_requesterId: { countryId, requesterId: viewer.id },
      },
      select: { id: true },
    });
    const data = {
      contactName: contact.contactName,
      contactEmail: contact.contactEmail,
      organisation: contact.organisation,
      role: contact.role,
      note: contact.note,
      slotStarts: starts,
      status: MeetingSignupStatus.ACTIVE,
    };
    const signup = existing
      ? await tx.meetingSignup.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        })
      : await tx.meetingSignup.create({
          data: { ...data, countryId, requesterId: viewer.id },
          select: { id: true },
        });
    await tx.meetingSignupProject.deleteMany({
      where: { signupId: signup.id },
    });
    await tx.meetingSignupProject.createMany({
      data: projects.map((p) => ({ signupId: signup.id, projectId: p.id })),
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: existing ? SIGNUP_AUDIT.UPDATE : SIGNUP_AUDIT.CREATE,
        entityType: "MeetingSignup",
        entityId: signup.id,
        meta,
        metadata: {
          countryId,
          fromProjectId: projectId,
          projects: projects.length,
          times: starts.length,
        },
      },
      tx,
    );
    return { id: signup.id, created: !existing };
  });
}

/** The investor withdraws their sign-up for a country, before the deadline. */
export async function withdrawSignup(
  viewer: Viewer,
  signupId: string,
  { meta, now = new Date() }: Options = {},
): Promise<void> {
  await db.$transaction(async (tx) => {
    const signup = await tx.meetingSignup.findFirst({
      where: { AND: [meetingSignupWhere(viewer), { id: signupId }] },
      select: { id: true, requesterId: true, status: true, countryId: true },
    });
    if (!signup) throw new SignupError("not_found");
    const passed = signupDeadlinePassed(now);
    if (!canWithdrawSignup(viewer, signup, passed)) {
      throw new SignupError(passed ? "closed" : "forbidden");
    }
    await tx.meetingSignup.update({
      where: { id: signup.id },
      data: { status: MeetingSignupStatus.WITHDRAWN },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: SIGNUP_AUDIT.WITHDRAW,
        entityType: "MeetingSignup",
        entityId: signup.id,
        meta,
        metadata: { countryId: signup.countryId },
      },
      tx,
    );
  });
}

const LIST_SELECT = {
  id: true,
  status: true,
  contactName: true,
  contactEmail: true,
  organisation: true,
  role: true,
  note: true,
  slotStarts: true,
  createdAt: true,
  updatedAt: true,
  country: { select: { id: true, name: true } },
  requester: {
    select: { name: true, email: true, organisationType: true },
  },
  projects: {
    select: { project: { select: { id: true, title: true } } },
    orderBy: { project: { title: "asc" as const } },
  },
} as const;

/** The investor's own sign-ups (My requests). */
export async function listMySignups(viewer: Viewer) {
  if (viewer.role !== "INVESTOR") return [];
  return db.meetingSignup.findMany({
    where: { AND: [meetingSignupWhere(viewer), { requesterId: viewer.id }] },
    orderBy: [{ status: "asc" }, { country: { name: "asc" } }],
    select: LIST_SELECT,
  });
}

function listWhere(viewer: Viewer, countryId?: string) {
  if (!canViewSignupList(viewer)) return NO_SIGNUP;
  return {
    AND: [meetingSignupWhere(viewer), countryId ? { countryId } : {}],
  };
}

/**
 * Sign-ups for the countries the viewer works for (admins: all), active ones first. Audited as a list view.
 * Countries and coordinators read only; nobody sees another country's sign-ups.
 */
export async function listCountrySignups(
  viewer: Viewer,
  { countryId, meta }: { countryId?: string; meta?: RequestMeta } = {},
) {
  if (!canViewSignupList(viewer)) return [];
  const rows = await db.meetingSignup.findMany({
    where: listWhere(viewer, countryId),
    orderBy: [
      { status: "asc" },
      { country: { name: "asc" } },
      { createdAt: "asc" },
    ],
    select: LIST_SELECT,
  });
  await writeAudit({
    actorId: viewer.id,
    action: SIGNUP_AUDIT.LIST,
    entityType: "MeetingSignup",
    meta,
    metadata: { count: rows.length, ...(countryId ? { countryId } : {}) },
  });
  return rows;
}

export const SIGNUP_EXPORT_HEADER = [
  "Country",
  "Status",
  "Organisation",
  "Attendee",
  "Attendee email",
  "Role",
  "Account email",
  "Projects of interest",
  "Times they can meet (UAE)",
  "Number of times",
  "Note",
  "Signed up",
  "Last changed",
] as const;

/** CSV of the sign-ups the viewer may list, for the Summit team's matching. */
export async function exportSignupsCsv(
  viewer: Viewer,
  { countryId, meta }: { countryId?: string; meta?: RequestMeta } = {},
): Promise<{ csv: string; count: number }> {
  if (!canViewSignupList(viewer)) throw new SignupError("forbidden");
  const rows = await db.meetingSignup.findMany({
    where: listWhere(viewer, countryId),
    orderBy: [{ country: { name: "asc" } }, { createdAt: "asc" }],
    select: LIST_SELECT,
  });
  await writeAudit({
    actorId: viewer.id,
    action: SIGNUP_AUDIT.EXPORT,
    entityType: "MeetingSignup",
    meta,
    metadata: { count: rows.length, ...(countryId ? { countryId } : {}) },
  });
  const csv = toCsv(
    SIGNUP_EXPORT_HEADER,
    rows.map((r) => [
      r.country.name,
      r.status === MeetingSignupStatus.ACTIVE ? "Signed up" : "Withdrawn",
      r.organisation,
      r.contactName,
      r.contactEmail,
      r.role,
      r.requester.email,
      r.projects.map((p) => p.project.title).join("; "),
      r.slotStarts.map(formatSignupSlotWithDay).join("; "),
      r.slotStarts.length,
      r.note,
      r.createdAt,
      r.updatedAt,
    ]),
  );
  return { csv, count: rows.length };
}

// ---------------------------------------------------------------------------
// Admin: the countries' time blocks and counterparts
// ---------------------------------------------------------------------------

export interface BlockLine {
  iso3: string;
  date: string;
  from: string;
  to: string;
  room: number;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the "Country time blocks" text: one block per line, `ISO3, YYYY-MM-DD, HH:MM, HH:MM, room number`
 * (room 1 to 4 as in WBG's sheet), UAE time. Blank lines and lines starting with # are skipped. Pure.
 */
export function parseBlockLines(
  text: string,
): { ok: true; blocks: BlockLine[] } | { ok: false; error: string } {
  const blocks: BlockLine[] = [];
  const lines = text.split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim());
    const where = `Line ${i + 1}`;
    if (cells.length !== 5) {
      return {
        ok: false,
        error: `${where}: expected 5 values (ISO3, date, from, to, room).`,
      };
    }
    const [iso3, date, from, to, room] = cells;
    if (!/^[A-Za-z]{3}$/.test(iso3)) {
      return { ok: false, error: `${where}: "${iso3}" is not an ISO3 code.` };
    }
    if (!DATE.test(date) || Number.isNaN(Date.parse(date))) {
      return { ok: false, error: `${where}: "${date}" is not a date.` };
    }
    if (!TIME.test(from) || !TIME.test(to) || from >= to) {
      return {
        ok: false,
        error: `${where}: the times must be HH:MM, the start before the end.`,
      };
    }
    const roomNumber = Number(room);
    if (
      !Number.isInteger(roomNumber) ||
      roomNumber < 1 ||
      roomNumber > BLOCK_ROOMS.length
    ) {
      return {
        ok: false,
        error: `${where}: the room must be a number from 1 to ${BLOCK_ROOMS.length}.`,
      };
    }
    blocks.push({ iso3: iso3.toUpperCase(), date, from, to, room: roomNumber });
  }
  if (blocks.length === 0) {
    return { ok: false, error: "Paste at least one block." };
  }
  return { ok: true, blocks };
}

/**
 * Replaces the time blocks of every country named in the text (admins). Countries not named keep theirs.
 * Rooms are matched by number; a hotel room is created the first time it is used. Sign-ups are not changed:
 * a time that falls outside the new blocks is simply not offered any more.
 */
export async function importMeetingBlocks(
  viewer: Viewer,
  text: string,
  { meta }: Options = {},
): Promise<{ countries: number; blocks: number }> {
  if (!canManageMeetingBlocks(viewer)) throw new SignupError("forbidden");
  const parsed = parseBlockLines(text);
  if (!parsed.ok) {
    throw new SignupError("invalid", { blocks: parsed.error });
  }
  return db.$transaction(async (tx) => {
    const isoCodes = [...new Set(parsed.blocks.map((b) => b.iso3))];
    const countries = await tx.country.findMany({
      where: { iso3: { in: isoCodes } },
      select: { id: true, iso3: true },
    });
    const byIso = new Map(countries.map((c) => [c.iso3, c.id]));
    const missing = isoCodes.filter((code) => !byIso.has(code));
    if (missing.length > 0) {
      throw new SignupError("invalid", {
        blocks: `No country in the portal with the code ${missing.join(", ")}. Add it under Countries first.`,
      });
    }
    const roomIds: string[] = [];
    for (const name of BLOCK_ROOMS) {
      const room = await tx.room.upsert({
        where: { name },
        create: { name, capacity: 0 },
        update: {},
        select: { id: true },
      });
      roomIds.push(room.id);
    }
    await tx.meetingBlock.deleteMany({
      where: { countryId: { in: [...byIso.values()] } },
    });
    await tx.meetingBlock.createMany({
      data: parsed.blocks.map((b) => ({
        countryId: byIso.get(b.iso3)!,
        roomId: roomIds[b.room - 1],
        startsAt: uaeTime(b.date, b.from),
        endsAt: uaeTime(b.date, b.to),
      })),
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: SIGNUP_AUDIT.BLOCKS_IMPORT,
        entityType: "MeetingBlock",
        meta,
        metadata: { countries: isoCodes, blocks: parsed.blocks.length },
      },
      tx,
    );
    return { countries: isoCodes.length, blocks: parsed.blocks.length };
  });
}

/** Every country's blocks and counterparts, for the admin page (admins only). */
export async function listCountryMeetingSetup(viewer: Viewer) {
  if (!canManageMeetingBlocks(viewer)) return [];
  return db.country.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      iso3: true,
      status: true,
      meetingCounterparts: true,
      meetingBlocks: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          room: { select: { name: true } },
        },
      },
      _count: {
        select: {
          meetingSignups: { where: { status: MeetingSignupStatus.ACTIVE } },
        },
      },
    },
  });
}

export const MAX_COUNTERPARTS = 4000;

/** Sets a country's "Government counterparts at UNWC" text (admins). Audited with the old and new line counts. */
export async function setCountryCounterparts(
  viewer: Viewer,
  countryId: string,
  text: string,
  { meta }: Options = {},
): Promise<void> {
  if (!canManageMeetingBlocks(viewer)) throw new SignupError("forbidden");
  const clean = counterpartLines(text.replace(/\u0000/g, "")).join("\n");
  if (clean.length > MAX_COUNTERPARTS) {
    throw new SignupError("invalid", {
      counterparts: `Keep the list to ${MAX_COUNTERPARTS} characters.`,
    });
  }
  await db.$transaction(async (tx) => {
    const country = await tx.country.findUnique({
      where: { id: countryId },
      select: { meetingCounterparts: true },
    });
    if (!country) throw new SignupError("not_found");
    await tx.country.update({
      where: { id: countryId },
      data: { meetingCounterparts: clean },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: SIGNUP_AUDIT.COUNTERPARTS_UPDATE,
        entityType: "Country",
        entityId: countryId,
        meta,
        metadata: {
          before: counterpartLines(country.meetingCounterparts).length,
          after: counterpartLines(clean).length,
        },
      },
      tx,
    );
  });
}

/** The counterparts of a project's country, for its page in the pipeline (anyone who may see that project there). */
export async function getProjectCounterparts(
  viewer: Viewer,
  projectId: string,
): Promise<string[]> {
  const project = await db.project.findFirst({
    where: { AND: [pipelineProjectWhere(viewer), { id: projectId }] },
    select: { country: { select: { meetingCounterparts: true } } },
  });
  return project ? counterpartLines(project.country.meetingCounterparts) : [];
}
