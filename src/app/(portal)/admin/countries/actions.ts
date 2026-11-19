"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { CountryStatus } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import {
  contactSchema,
  type ContactsPreviewState,
  countrySchema,
} from "@/lib/admin/contacts-input";
import {
  addContact,
  applyContactsImport,
  createCountry,
  previewContactsImport,
  removeContact,
  setCountryStatus,
  updateContact,
} from "@/lib/admin/countries";
import { ADMIN_MESSAGES, AdminError } from "@/lib/admin/errors";

// Admin countries and contacts (M7). Thin wrappers: the services decide through src/lib/authz/admin.ts.

export interface AdminFormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

function refused(error: unknown): AdminFormState {
  if (!(error instanceof AdminError)) throw error;
  return {
    error: Object.values(error.fieldErrors)[0] ?? ADMIN_MESSAGES[error.code],
    fieldErrors: error.fieldErrors,
  };
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
  }
  return { error: Object.values(fieldErrors)[0], fieldErrors };
}

const id = (value: unknown) => String(value ?? "").slice(0, 64);

export async function createCountryAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const viewer = await requireViewer();
  const parsed = countrySchema.safeParse({
    name: formData.get("name") ?? "",
    iso3: formData.get("iso3") ?? "",
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error.issues);
  try {
    await createCountry(viewer, parsed.data, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { message: `${parsed.data.name} added.` };
  } catch (error) {
    return refused(error);
  }
}

export async function setCountryStatusAction(
  countryId: string,
  active: boolean,
): Promise<AdminFormState> {
  const viewer = await requireViewer();
  try {
    await setCountryStatus(
      viewer,
      id(countryId),
      active ? CountryStatus.ACTIVE : CountryStatus.INACTIVE,
      { meta: requestMetaFrom(await headers()) },
    );
    refresh();
    return { message: active ? "Switched on." : "Switched off." };
  } catch (error) {
    return refused(error);
  }
}

function contactFrom(formData: FormData) {
  return contactSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });
}

export async function addContactAction(
  countryId: string,
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const viewer = await requireViewer();
  const parsed = contactFrom(formData);
  if (!parsed.success) return fieldErrorsOf(parsed.error.issues);
  try {
    const { linked } = await addContact(viewer, id(countryId), parsed.data, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return {
      message: linked
        ? `${parsed.data.name} added and linked to their account.`
        : `${parsed.data.name} added.`,
    };
  } catch (error) {
    return refused(error);
  }
}

export async function updateContactAction(
  contactId: string,
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const viewer = await requireViewer();
  const parsed = contactFrom(formData);
  if (!parsed.success) return fieldErrorsOf(parsed.error.issues);
  try {
    const changed = await updateContact(viewer, id(contactId), parsed.data, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { message: changed.length > 0 ? "Saved." : "Nothing changed." };
  } catch (error) {
    return refused(error);
  }
}

export async function removeContactAction(
  contactId: string,
): Promise<AdminFormState> {
  const viewer = await requireViewer();
  try {
    await removeContact(viewer, id(contactId), {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { message: "Contact removed." };
  } catch (error) {
    return refused(error);
  }
}

const MAX_TEXT = 1_000_000;

export async function previewContactsAction(
  text: string,
): Promise<ContactsPreviewState> {
  const viewer = await requireViewer();
  if (typeof text !== "string" || text.length > MAX_TEXT) {
    return {
      ok: false,
      error: "The file is too large. Split it into smaller files.",
    };
  }
  try {
    return { ok: true, preview: await previewContactsImport(viewer, text) };
  } catch (error) {
    return { ok: false, error: refused(error).error ?? ADMIN_MESSAGES.invalid };
  }
}

export async function applyContactsAction(
  text: string,
  digest: string,
): Promise<
  { ok: true; created: number; linked: number } | { ok: false; error: string }
> {
  const viewer = await requireViewer();
  if (
    typeof text !== "string" ||
    text.length > MAX_TEXT ||
    typeof digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(digest)
  ) {
    return { ok: false, error: ADMIN_MESSAGES.invalid };
  }
  try {
    const result = await applyContactsImport(viewer, text, digest, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: refused(error).error ?? ADMIN_MESSAGES.invalid };
  }
}
