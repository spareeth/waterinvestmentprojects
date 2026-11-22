"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import {
  addApprovedContacts,
  addApprovedOrganisation,
  PreApprovalError,
  removeApprovedContact,
  removeApprovedOrganisation,
} from "@/lib/admin/registrations";
import {
  decideRegistration,
  RegistrationDecisionError,
} from "@/lib/auth/service";
import { requireViewer } from "@/lib/authz";

// M13 (PLAN v0.4 0b.17 to 0b.21): decisions on registrations and the pre-approved list. Each action gets the
// Viewer itself; the services decide through src/lib/authz/account-policies.ts and write the audit trail.

export interface AdminActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

function preApprovalRefused(error: unknown): AdminActionState {
  if (!(error instanceof PreApprovalError)) throw error;
  if (error.code === "invalid") {
    return {
      error: Object.values(error.fieldErrors)[0] ?? "Please check the details.",
      fieldErrors: error.fieldErrors,
    };
  }
  return {
    error:
      error.code === "forbidden"
        ? "You do not have permission to do this."
        : "This entry is no longer on the list.",
  };
}

export async function decideRegistrationAction(
  userId: string,
  decision: "approve" | "reject",
): Promise<AdminActionState> {
  const viewer = await requireViewer();
  try {
    await decideRegistration(viewer, userId, decision, await headers());
  } catch (error) {
    if (!(error instanceof RegistrationDecisionError)) throw error;
    return { error: error.message };
  }
  refresh();
  return {
    success:
      decision === "approve" ? "Access approved." : "Registration rejected.",
  };
}

export async function addApprovedOrganisationAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const viewer = await requireViewer();
  const text = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  try {
    await addApprovedOrganisation(
      viewer,
      { name: text("name"), domains: text("domains"), source: text("source") },
      requestMetaFrom(await headers()),
    );
  } catch (error) {
    return preApprovalRefused(error);
  }
  refresh();
  return { success: "Organisation added." };
}

export async function addApprovedContactsAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const viewer = await requireViewer();
  const emails = formData.get("emails");
  const organisationId = formData.get("organisationId");
  try {
    const result = await addApprovedContacts(
      viewer,
      {
        emails: typeof emails === "string" ? emails : "",
        organisationId:
          typeof organisationId === "string" && organisationId
            ? organisationId
            : null,
      },
      requestMetaFrom(await headers()),
    );
    refresh();
    return {
      success: `${result.added} added${result.existing > 0 ? `, ${result.existing} already on the list` : ""}.`,
    };
  } catch (error) {
    return preApprovalRefused(error);
  }
}

export async function removeApprovedOrganisationAction(
  id: string,
): Promise<AdminActionState> {
  const viewer = await requireViewer();
  try {
    await removeApprovedOrganisation(
      viewer,
      id,
      requestMetaFrom(await headers()),
    );
  } catch (error) {
    return preApprovalRefused(error);
  }
  refresh();
  return { success: "Organisation removed." };
}

export async function removeApprovedContactAction(
  email: string,
): Promise<AdminActionState> {
  const viewer = await requireViewer();
  try {
    await removeApprovedContact(
      viewer,
      email,
      requestMetaFrom(await headers()),
    );
  } catch (error) {
    return preApprovalRefused(error);
  }
  refresh();
  return { success: "Contact removed." };
}
