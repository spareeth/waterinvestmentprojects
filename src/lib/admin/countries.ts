import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  CountryContactRole,
  CountryStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import type { Viewer } from "@/lib/authz";
import {
  canManageContacts,
  canManageCountries,
  contactWhere,
} from "@/lib/authz/admin";
import { db } from "@/lib/db";
import {
  type ContactInput,
  type ContactPlan,
  CONTACTS_MAX_ROWS,
  type CountryInput,
  planContactsImport,
} from "./contacts-input";
import { parseCsv } from "./csv-parse";
import { ADMIN_AUDIT, AdminError } from "./errors";

// Admin console, countries and their contacts (M7, PLAN v0.3 0.10 and F7). WBG names each country's focal points
// and its WBG coordinator; admins enter them here (one by one or from a CSV). A contact is who receives the
// country's notifications. It gives no access: access comes from an account, which is linked to the contact by the
// same email address (and a matching role and country), here and when M2's createAccount makes the account.

interface Options {
  meta?: RequestMeta;
}

type Tx = Prisma.TransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** Account role that matches a contact role. */
function accountRoleFor(role: CountryContactRole): UserRole {
  return role === CountryContactRole.FOCAL_POINT
    ? UserRole.COUNTRY
    : UserRole.WBG_COORDINATOR;
}

/** The account to link to a contact: same email, matching role, and working for that country. */
async function linkableUserId(
  client: Tx | typeof db,
  countryId: string,
  email: string,
  role: CountryContactRole,
): Promise<string | null> {
  const user = await client.user.findFirst({
    where: {
      email,
      role: accountRoleFor(role),
      memberships: { some: { countryId } },
    },
    select: { id: true },
  });
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

export async function listAdminCountries(viewer: Viewer) {
  if (!canManageCountries(viewer)) throw new AdminError("forbidden");
  const countries = await db.country.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      iso3: true,
      status: true,
      contacts: {
        where: contactWhere(viewer),
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, email: true, role: true, userId: true },
      },
      _count: { select: { projects: true, memberships: true } },
    },
  });
  return countries;
}

export type AdminCountry = Awaited<
  ReturnType<typeof listAdminCountries>
>[number];

/** One country with its contacts (and their linked accounts) and the accounts that work for it. */
export async function getAdminCountry(viewer: Viewer, countryId: string) {
  if (!canManageCountries(viewer)) throw new AdminError("forbidden");
  return db.country.findUnique({
    where: { id: countryId },
    select: {
      id: true,
      name: true,
      iso3: true,
      status: true,
      contacts: {
        where: contactWhere(viewer),
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          user: { select: { id: true, name: true, status: true } },
        },
      },
      memberships: {
        orderBy: { user: { name: "asc" } },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
            },
          },
        },
      },
      _count: { select: { projects: true } },
    },
  });
}

export async function createCountry(
  viewer: Viewer,
  input: CountryInput,
  { meta }: Options = {},
): Promise<{ id: string }> {
  if (!canManageCountries(viewer)) throw new AdminError("forbidden");
  try {
    return await db.$transaction(async (tx) => {
      const country = await tx.country.create({
        data: { name: input.name, iso3: input.iso3 },
        select: { id: true },
      });
      await writeAudit(
        {
          actorId: viewer.id,
          action: ADMIN_AUDIT.COUNTRY_CREATE,
          entityType: "Country",
          entityId: country.id,
          meta,
          metadata: { name: input.name, iso3: input.iso3 },
        },
        tx,
      );
      return country;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminError("exists", {
        name: "A country with this name or ISO code already exists.",
      });
    }
    throw error;
  }
}

/**
 * Switches a country on or off. An INACTIVE country's projects leave the pipeline and its upload link stops
 * working (both decided in src/lib/authz); nothing is deleted.
 */
export async function setCountryStatus(
  viewer: Viewer,
  countryId: string,
  status: CountryStatus,
  { meta }: Options = {},
): Promise<void> {
  if (!canManageCountries(viewer)) throw new AdminError("forbidden");
  await db.$transaction(async (tx) => {
    const country = await tx.country.findUnique({
      where: { id: countryId },
      select: { status: true },
    });
    if (!country) throw new AdminError("not_found");
    if (country.status === status) return;
    await tx.country.update({ where: { id: countryId }, data: { status } });
    await writeAudit(
      {
        actorId: viewer.id,
        action:
          status === CountryStatus.ACTIVE
            ? ADMIN_AUDIT.COUNTRY_ACTIVATE
            : ADMIN_AUDIT.COUNTRY_DEACTIVATE,
        entityType: "Country",
        entityId: countryId,
        meta,
        metadata: { previousStatus: country.status, status },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const DUPLICATE_CONTACT =
  "This person is already a contact of the country in this role.";

export async function addContact(
  viewer: Viewer,
  countryId: string,
  input: ContactInput,
  { meta }: Options = {},
): Promise<{ id: string; linked: boolean }> {
  if (!canManageContacts(viewer)) throw new AdminError("forbidden");
  try {
    return await db.$transaction(async (tx) => {
      const country = await tx.country.findUnique({
        where: { id: countryId },
        select: { id: true },
      });
      if (!country) throw new AdminError("not_found");
      const userId = await linkableUserId(
        tx,
        countryId,
        input.email,
        input.role,
      );
      const contact = await tx.countryContact.create({
        data: { countryId, ...input, userId },
        select: { id: true },
      });
      await writeAudit(
        {
          actorId: viewer.id,
          action: ADMIN_AUDIT.CONTACT_CREATE,
          entityType: "CountryContact",
          entityId: contact.id,
          meta,
          metadata: {
            countryId,
            email: input.email,
            role: input.role,
            linkedUserId: userId,
            source: "admin",
          },
        },
        tx,
      );
      return { id: contact.id, linked: userId !== null };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminError("exists", { email: DUPLICATE_CONTACT });
    }
    throw error;
  }
}

export async function updateContact(
  viewer: Viewer,
  contactId: string,
  input: ContactInput,
  { meta }: Options = {},
): Promise<string[]> {
  if (!canManageContacts(viewer)) throw new AdminError("forbidden");
  try {
    return await db.$transaction(async (tx) => {
      const contact = await tx.countryContact.findFirst({
        where: { AND: [contactWhere(viewer), { id: contactId }] },
        select: {
          countryId: true,
          name: true,
          email: true,
          role: true,
          userId: true,
        },
      });
      if (!contact) throw new AdminError("not_found");
      const changed = (["name", "email", "role"] as const).filter(
        (key) => contact[key] !== input[key],
      );
      if (changed.length === 0) return [];
      const userId = await linkableUserId(
        tx,
        contact.countryId,
        input.email,
        input.role,
      );
      await tx.countryContact.update({
        where: { id: contactId },
        data: { ...input, userId },
      });
      await writeAudit(
        {
          actorId: viewer.id,
          action: ADMIN_AUDIT.CONTACT_UPDATE,
          entityType: "CountryContact",
          entityId: contactId,
          meta,
          metadata: {
            countryId: contact.countryId,
            changed,
            previous: { email: contact.email, role: contact.role },
            email: input.email,
            role: input.role,
            linkedUserId: userId,
          },
        },
        tx,
      );
      return changed;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminError("exists", { email: DUPLICATE_CONTACT });
    }
    throw error;
  }
}

/** Removes a contact (no more notifications). Its account, if any, is not touched. */
export async function removeContact(
  viewer: Viewer,
  contactId: string,
  { meta }: Options = {},
): Promise<void> {
  if (!canManageContacts(viewer)) throw new AdminError("forbidden");
  await db.$transaction(async (tx) => {
    const contact = await tx.countryContact.findFirst({
      where: { AND: [contactWhere(viewer), { id: contactId }] },
      select: { countryId: true, email: true, role: true, name: true },
    });
    if (!contact) throw new AdminError("not_found");
    await tx.countryContact.delete({ where: { id: contactId } });
    await writeAudit(
      {
        actorId: viewer.id,
        action: ADMIN_AUDIT.CONTACT_DELETE,
        entityType: "CountryContact",
        entityId: contactId,
        meta,
        metadata: contact,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Contacts from a CSV (WBG's focal point list and coordinator mapping)
// ---------------------------------------------------------------------------

export interface ContactsPreview {
  plan: ContactPlan;
  digest: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function contactsPlanFor(text: string): Promise<ContactsPreview> {
  const parsed = parseCsv(text, { maxRows: CONTACTS_MAX_ROWS });
  if (!parsed.ok) {
    const plan: ContactPlan = {
      fileErrors: [parsed.error],
      rows: [],
      summary: { rows: 0, ready: 0, existing: 0, errors: 0 },
    };
    return { plan, digest: sha256(`${sha256(text)}|error`) };
  }
  const [countries, contacts] = await Promise.all([
    db.country.findMany({ select: { id: true, iso3: true } }),
    db.countryContact.findMany({
      select: { countryId: true, email: true, role: true },
    }),
  ]);
  const existing = new Set(
    contacts.map((c) => `${c.countryId}|${c.email}|${c.role}`),
  );
  const plan = planContactsImport(parsed.table, countries, existing);
  const ready = plan.rows
    .filter((r) => r.errors.length === 0 && !r.exists)
    .map((r) => [r.countryId, r.email, r.role, r.name]);
  return {
    plan,
    digest: sha256(
      `${sha256(text)}|${JSON.stringify([plan.fileErrors, ready])}`,
    ),
  };
}

export async function previewContactsImport(
  viewer: Viewer,
  text: string,
): Promise<ContactsPreview> {
  if (!canManageContacts(viewer)) throw new AdminError("forbidden");
  return contactsPlanFor(text);
}

/** Adds every new valid contact in one transaction. Stored contacts are left as they are (never overwritten). */
export async function applyContactsImport(
  viewer: Viewer,
  text: string,
  digest: string,
  { meta }: Options = {},
): Promise<{ created: number; linked: number }> {
  if (!canManageContacts(viewer)) throw new AdminError("forbidden");
  const { plan, digest: fresh } = await contactsPlanFor(text);
  if (plan.fileErrors.length > 0) throw new AdminError("invalid");
  if (fresh !== digest) throw new AdminError("stale");
  const ready = plan.rows.filter((r) => r.errors.length === 0 && !r.exists);
  try {
    return await db.$transaction(async (tx) => {
      let linked = 0;
      for (const row of ready) {
        if (!row.countryId || !row.role) throw new AdminError("invalid");
        const userId = await linkableUserId(
          tx,
          row.countryId,
          row.email,
          row.role,
        );
        if (userId) linked += 1;
        const contact = await tx.countryContact.create({
          data: {
            countryId: row.countryId,
            name: row.name,
            email: row.email,
            role: row.role,
            userId,
          },
          select: { id: true },
        });
        await writeAudit(
          {
            actorId: viewer.id,
            action: ADMIN_AUDIT.CONTACT_CREATE,
            entityType: "CountryContact",
            entityId: contact.id,
            meta,
            metadata: {
              countryId: row.countryId,
              email: row.email,
              role: row.role,
              linkedUserId: userId,
              source: "csv_import",
            },
          },
          tx,
        );
      }
      await writeAudit(
        {
          actorId: viewer.id,
          action: ADMIN_AUDIT.CONTACT_IMPORT,
          entityType: "CountryContact",
          entityId: null,
          meta,
          metadata: {
            fileSha256: sha256(text),
            rows: plan.summary.rows,
            created: ready.length,
            existing: plan.summary.existing,
            errors: plan.summary.errors,
          },
        },
        tx,
      );
      return { created: ready.length, linked };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdminError("stale");
    throw error;
  }
}
