// Why an admin console action was refused, and the audit action names of M7. Pure. British spelling, no em dashes.

export type AdminErrorCode =
  | "forbidden"
  | "not_found"
  | "invalid"
  | "exists"
  | "stale"
  | "conflict"
  | "too_large";

export class AdminError extends Error {
  constructor(
    public readonly code: AdminErrorCode,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(`Admin action refused: ${code}`);
    this.name = "AdminError";
  }
}

export const ADMIN_MESSAGES: Record<AdminErrorCode, string> = {
  forbidden: "You do not have permission to do this.",
  not_found: "This item could not be found. Reload the page and try again.",
  invalid: "Please check the details and try again.",
  exists: "This already exists.",
  stale:
    "Something changed since the preview. Check the new preview before applying.",
  conflict:
    "A project changed while the import was running. Nothing was saved. Preview the file again.",
  too_large:
    "The export is too large to build in one go. Contact Terra for a server-side export.",
};

/** Audit actions written by the admin console (CLAUDE.md: every create, update, delete, grant, revoke, export). */
export const ADMIN_AUDIT = {
  METADATA_IMPORT: "project_metadata.import",
  PROJECT_UPDATE: "project.update",
  COUNTRY_CREATE: "country.create",
  COUNTRY_ACTIVATE: "country.activate",
  COUNTRY_DEACTIVATE: "country.deactivate",
  CONTACT_CREATE: "country_contact.create",
  CONTACT_UPDATE: "country_contact.update",
  CONTACT_DELETE: "country_contact.delete",
  CONTACT_IMPORT: "country_contact.import",
  ACCOUNTS_BULK_CREATE: "user.bulk_create",
  USER_DEACTIVATE: "user.deactivate",
  USER_REACTIVATE: "user.reactivate",
} as const;

export type ExportKind =
  "projects" | "submissions" | "accounts" | "contacts" | "audit" | "country";

export function exportAuditAction(kind: ExportKind): string {
  return `export.${kind}`;
}
