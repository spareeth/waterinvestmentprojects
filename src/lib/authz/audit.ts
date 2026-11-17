import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import type { Viewer } from "./viewer";

// Audit events for reading data (CLAUDE.md: every view and download writes an AuditEvent).
// Writes (create, update, delete, grant, revoke) are audited by the feature code in the same transaction.

export const AUTHZ_AUDIT = {
  PROJECT_VIEW: "project.view",
  DOCUMENT_VIEW: "document.view",
  DOCUMENT_DOWNLOAD: "document.download",
  /** A refused attempt to open or download something. */
  ACCESS_DENIED: "access.denied",
} as const;

export type AuthzAuditAction = (typeof AUTHZ_AUDIT)[keyof typeof AUTHZ_AUDIT];

export interface AccessAuditInput {
  action: AuthzAuditAction;
  entityType: "Project" | "Document" | "MeetingRequest" | "Slot";
  entityId: string;
  meta?: RequestMeta;
  metadata?: Prisma.InputJsonValue;
}

/** Records that the viewer looked at, downloaded or was refused something. */
export async function auditAccess(
  viewer: Viewer | null,
  input: AccessAuditInput,
  client?: Pick<Prisma.TransactionClient, "auditEvent">,
): Promise<void> {
  await writeAudit(
    {
      actorId: viewer?.id ?? null,
      action: input.action,
      entityType: input.entityType,
      // Ids can come from the URL; keep a refused, made-up id from bloating the log.
      entityId: input.entityId.slice(0, 64),
      meta: input.meta,
      metadata: input.metadata,
    },
    client,
  );
}
